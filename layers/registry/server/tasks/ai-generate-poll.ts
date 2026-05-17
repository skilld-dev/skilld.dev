import type { GeneratedKind } from '~~/layers/registry/server/utils/skill-generated'
/// <reference types="@cloudflare/workers-types" />
import { putGenerated } from '~~/layers/registry/server/utils/skill-generated'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { extractJson } from '#shared/server/anthropic'

const CRON = '45 * * * *'
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_BATCHES_BASE = 'https://api.anthropic.com/v1/messages/batches'

interface BatchRow {
  id: number
  anthropic_batch_id: string
  kinds: string
  skill_count: number
  status: string
  index_map: string | null
}

interface IndexEntry {
  owner: string
  repo: string
  name: string
  sha: string
}

interface BatchResultLine {
  custom_id: string
  result: {
    type: 'succeeded' | 'errored' | 'canceled' | 'expired'
    message?: {
      content?: Array<{ type: string, text?: string }>
      usage?: { input_tokens?: number, output_tokens?: number }
    }
    error?: { type: string, message: string }
  }
}

// Haiku 4.5 batch pricing per million tokens (50% discount off realtime).
const HAIKU_BATCH_INPUT_USD_PER_MTOK = 0.50
const HAIKU_BATCH_OUTPUT_USD_PER_MTOK = 2.50

interface BatchStatusResponse {
  id: string
  processing_status: 'in_progress' | 'canceling' | 'ended'
  results_url?: string | null
  ended_at?: string | null
}

function decodeCustomId(customId: string): { index: number, kind: GeneratedKind } | null {
  const m = customId.match(/^(\d+)-(summary|tags|faq)$/)
  if (!m)
    return null
  return { index: Number.parseInt(m[1]!, 10), kind: m[2]! as GeneratedKind }
}

function extractMessageText(line: BatchResultLine): string {
  return (line.result.message?.content ?? [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text!)
    .join('')
}

function parsePayload(kind: GeneratedKind, text: string): unknown | null {
  if (kind === 'summary') {
    const trimmed = text.trim().replace(/^["']|["']$/g, '')
    return trimmed.length > 0 ? { text: trimmed } : null
  }
  if (kind === 'tags') {
    const parsed = extractJson<string[]>(text)
    if (!Array.isArray(parsed))
      return null
    const cleaned = parsed
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length > 0 && t.length < 40)
    return cleaned.length ? { tags: cleaned } : null
  }
  if (kind === 'faq') {
    const parsed = extractJson<Array<{ question?: string, answer?: string }>>(text)
    if (!Array.isArray(parsed))
      return null
    const cleaned = parsed
      .filter(f => typeof f?.question === 'string' && typeof f?.answer === 'string')
      .map(f => ({ question: f.question!.trim(), answer: f.answer!.trim() }))
    return cleaned.length ? { faqs: cleaned } : null
  }
  return null
}

export default defineTask({
  meta: {
    name: 'ai-generate-poll',
    description: 'Poll Anthropic batches and UPSERT skill_generated when results land',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    const apiKey = (env?.ANTHROPIC_API_KEY as string | undefined) || process.env.ANTHROPIC_API_KEY

    if (!db) {
      console.warn('[ai-generate-poll] D1 binding missing')
      return { result: { error: 'no-db' } }
    }
    if (!apiKey) {
      console.warn('[ai-generate-poll] ANTHROPIC_API_KEY missing')
      return { result: { error: 'no-api-key' } }
    }

    const startedAt = Date.now()
    try {
      const result = await pollBatches(db, apiKey)
      await reportJobRun(db, 'ai-generate-poll', {
        cron: CRON,
        status: (result.failed ?? 0) > 0 ? 'partial' : 'ok',
        durationMs: Date.now() - startedAt,
        error: (result.failed ?? 0) > 0 ? `${result.failed} batches failed` : null,
      })
      return { result }
    }
    catch (err) {
      await reportJobRun(db, 'ai-generate-poll', {
        cron: CRON,
        status: 'error',
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
      })
      throw err
    }
  },
})

async function pollBatches(db: D1Database, apiKey: string) {
  // Skip batches younger than 60s: Anthropic returns 404 transiently right
  // after submit. LIMIT 100 keeps the backlog drained well ahead of the 24h
  // batch expiry even if many submits queue up.
  const minAge = Math.floor(Date.now() / 1000) - 60
  const pending = await db
    .prepare(`SELECT id, anthropic_batch_id, kinds, skill_count, status, index_map FROM ai_batches WHERE status = 'submitted' AND submitted_at < ?1 ORDER BY submitted_at ASC LIMIT 100`)
    .bind(minAge)
    .all<BatchRow>()

  const rows = pending.results ?? []
  if (!rows.length)
    return { polled: 0, completed: 0, stillRunning: 0, expired: 0, failed: 0, rowsWritten: 0, parseFailures: 0 }

  const summary = {
    polled: rows.length,
    completed: 0,
    stillRunning: 0,
    expired: 0,
    failed: 0,
    rowsWritten: 0,
    parseFailures: 0,
  }

  for (const batch of rows) {
    // Check status first.
    const statusRes = await fetch(`${ANTHROPIC_BATCHES_BASE}/${batch.anthropic_batch_id}`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    })
    if (!statusRes.ok) {
      console.warn(`[ai-generate-poll] status ${batch.anthropic_batch_id}: ${statusRes.status}`)
      continue
    }
    const status = await statusRes.json() as BatchStatusResponse

    if (status.processing_status !== 'ended') {
      summary.stillRunning += 1
      continue
    }

    // Fetch results JSONL.
    const resultsUrl = status.results_url || `${ANTHROPIC_BATCHES_BASE}/${batch.anthropic_batch_id}/results`
    const resultsRes = await fetch(resultsUrl, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    })
    if (!resultsRes.ok) {
      console.warn(`[ai-generate-poll] results ${batch.anthropic_batch_id}: ${resultsRes.status}`)
      await db
        .prepare(`UPDATE ai_batches SET status = 'failed', completed_at = ? WHERE id = ?`)
        .bind(Math.floor(Date.now() / 1000), batch.id)
        .run()
      summary.failed += 1
      continue
    }

    const indexMap = batch.index_map
      ? JSON.parse(batch.index_map) as IndexEntry[]
      : null
    if (!indexMap) {
      console.warn(`[ai-generate-poll] index_map missing on row ${batch.id}; cannot resolve custom_ids`)
      await db
        .prepare(`UPDATE ai_batches SET status = 'failed', completed_at = ? WHERE id = ?`)
        .bind(Math.floor(Date.now() / 1000), batch.id)
        .run()
      summary.failed += 1
      continue
    }

    const text = await resultsRes.text()
    const lines = text.split('\n').filter(l => l.trim().length > 0)
    let hadExpired = false
    let inputTokens = 0
    let outputTokens = 0
    // Track which (index → set of batch kinds successfully written). Once
    // an index has all 3 (summary/tags/faq), we mark skills.ai_generated_sha
    // so ai-generate-submit can short-circuit on this SHA next cycle.
    const kindsByIndex = new Map<number, Set<GeneratedKind>>()
    for (const raw of lines) {
      const line = JSON.parse(raw) as BatchResultLine
      if (line.result.type === 'expired') {
        hadExpired = true
        continue
      }
      if (line.result.type !== 'succeeded')
        continue
      const usage = line.result.message?.usage
      if (usage) {
        inputTokens += usage.input_tokens ?? 0
        outputTokens += usage.output_tokens ?? 0
      }
      const decoded = decodeCustomId(line.custom_id)
      if (!decoded)
        continue
      const entry = indexMap[decoded.index]
      if (!entry)
        continue
      const messageText = extractMessageText(line)
      const payload = parsePayload(decoded.kind, messageText)
      if (!payload) {
        summary.parseFailures += 1
        continue
      }
      await putGenerated(db, {
        owner: entry.owner,
        repo: entry.repo,
        name: entry.name,
        kind: decoded.kind,
        sha: entry.sha,
        payload,
      })
      summary.rowsWritten += 1
      const set = kindsByIndex.get(decoded.index) ?? new Set<GeneratedKind>()
      set.add(decoded.kind)
      kindsByIndex.set(decoded.index, set)
    }

    // Mark skills whose batch kinds all landed: short-circuit for next
    // ai-generate-submit so the heavy NOT EXISTS scan is bypassed when
    // current_sha hasn't changed since this batch.
    for (const [idx, kinds] of kindsByIndex) {
      if (!kinds.has('summary') || !kinds.has('tags') || !kinds.has('faq'))
        continue
      const entry = indexMap[idx]
      if (!entry)
        continue
      await db
        .prepare(`UPDATE skills SET ai_generated_sha = ?1 WHERE owner = ?2 AND repo = ?3 AND name = ?4 AND current_sha = ?1`)
        .bind(entry.sha, entry.owner, entry.repo, entry.name)
        .run()
    }

    const finalStatus = hadExpired && summary.rowsWritten === 0 ? 'expired' : 'completed'
    const completedAt = Math.floor(Date.now() / 1000)
    await db
      .prepare(`UPDATE ai_batches SET status = ?, completed_at = ? WHERE id = ?`)
      .bind(finalStatus, completedAt, batch.id)
      .run()

    const estCostUsd
      = (inputTokens / 1_000_000) * HAIKU_BATCH_INPUT_USD_PER_MTOK
        + (outputTokens / 1_000_000) * HAIKU_BATCH_OUTPUT_USD_PER_MTOK
    await db
      .prepare(
        `UPDATE ai_batch_costs
           SET completed_at = ?, input_tokens = ?, output_tokens = ?, est_cost_usd = ?
           WHERE anthropic_batch_id = ?`,
      )
      .bind(completedAt, inputTokens, outputTokens, estCostUsd, batch.anthropic_batch_id)
      .run()
    if (finalStatus === 'expired')
      summary.expired += 1
    else
      summary.completed += 1
  }

  console.warn('[ai-generate-poll] done', summary)
  return summary
}
