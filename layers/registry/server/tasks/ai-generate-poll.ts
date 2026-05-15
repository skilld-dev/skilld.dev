import type { GeneratedKind } from '~~/layers/registry/server/utils/skill-generated'
/// <reference types="@cloudflare/workers-types" />
import { putGenerated } from '~~/layers/registry/server/utils/skill-generated'
import { extractJson } from '#shared/server/anthropic'

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
    }
    error?: { type: string, message: string }
  }
}

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

    const pending = await db
      .prepare(`SELECT id, anthropic_batch_id, kinds, skill_count, status, index_map FROM ai_batches WHERE status = 'submitted' ORDER BY submitted_at ASC LIMIT 20`)
      .all<BatchRow>()

    const rows = pending.results ?? []
    if (!rows.length)
      return { result: { polled: 0 } }

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
      for (const raw of lines) {
        const line = JSON.parse(raw) as BatchResultLine
        if (line.result.type === 'expired') {
          hadExpired = true
          continue
        }
        if (line.result.type !== 'succeeded')
          continue
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
      }

      const finalStatus = hadExpired && summary.rowsWritten === 0 ? 'expired' : 'completed'
      await db
        .prepare(`UPDATE ai_batches SET status = ?, completed_at = ? WHERE id = ?`)
        .bind(finalStatus, Math.floor(Date.now() / 1000), batch.id)
        .run()
      if (finalStatus === 'expired')
        summary.expired += 1
      else
        summary.completed += 1
    }

    console.warn('[ai-generate-poll] done', summary)
    return { result: summary }
  },
})
