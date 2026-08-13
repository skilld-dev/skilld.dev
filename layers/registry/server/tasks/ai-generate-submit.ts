import type { GenerationSkill } from '../utils/ai-generation-work'
import type {
  EmbeddingAiBinding,
  EmbeddingEffectDependencies,
  EmbeddingEffectResult,
  EmbeddingVectorizeBinding,
} from '../utils/embedding-effect'
import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { extractJson } from '#shared/server/anthropic'
import { pAll } from '#shared/server/p-all'
import {
  ABSTRACTNESS_MODEL,
  abstractnessResponseText,
  buildAbstractnessUserPrompt,
  countMissingEmbeddings,
  parseAbstractnessPayload,
  persistAbstractness,
  runtimeGenerationLimits,
  selectMissingBatchSkills,
  selectMissingGeneratedSkills,
} from '../utils/ai-generation-work'
import {
  ABSTRACTNESS_RESPONSE_FORMAT,
  ABSTRACTNESS_SYSTEM_PROMPT,
  BATCH_KINDS,
  SHARED_SYSTEM_PROMPT,
} from '../utils/ai-prompts'
import {
  embeddingEffectSummary,
  embeddingPreflightResult,
  runEmbeddingEffect,
} from '../utils/embedding-effect'
/// <reference types="@cloudflare/workers-types" />

const CRON = '15 * * * *'
// Bounded so a single backfill spike can't blow Anthropic batch spend.
// Steady state is much lower thanks to the ai_generated_sha short-circuit.
const BATCH_LIMIT = 50
// Cloudflare Vectorize free tier rate-limits upserts aggressively (429
// VECTOR_UPSERT_ERROR 40041 at concurrency 8). 3 is the sustainable
// ceiling observed in production; wall time goes 7s → ~18s, still well
// under the scheduled-handler budget.
const AI_CONCURRENCY = 3
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
// Kill switch: pause Anthropic Haiku batch spend while we investigate the
// scaled-content-abuse deindexing (10k AI pages → 0.6% indexed, sitewide
// demotion late Apr 2026). Embeddings/abstractness (Workers AI, ~free) keep
// running so search recall doesn't regress. Flip back to false to resume.
const HAIKU_GENERATION_PAUSED = true
const ANTHROPIC_BATCH_URL = 'https://api.anthropic.com/v1/messages/batches'
const ANTHROPIC_VERSION = '2023-06-01'

type AiBinding = EmbeddingAiBinding
type VectorizeBinding = EmbeddingVectorizeBinding

interface BatchRequestItem {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    system: Array<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>
    messages: Array<{ role: 'user', content: string }>
  }
}

// custom_id must be ASCII-safe and ≤64 chars. owner/repo/name are
// freeform; hash them to a short prefix and append the kind. We also store
// the original mapping in payload-by-index so the poll task can resolve.
function encodeCustomId(index: number, kind: string): string {
  return `${index}-${kind}`
}

export default defineScheduledTask({
  name: 'ai-generate-submit',
  cron: '15 * * * *',
  description: 'Submit Anthropic batch for stale summary/tags/faq + run Workers AI for embedding/abstractness',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    const ai = env?.AI as AiBinding | undefined
    const vectorize = env?.SKILL_EMBEDDINGS as VectorizeBinding | undefined
    const apiKey = (env?.ANTHROPIC_API_KEY as string | undefined) || process.env.ANTHROPIC_API_KEY

    if (!env || !db) {
      emitOperationalEvent(createWideEvent({ operation: 'ai-generate-submit', outcome: 'binding-missing' }))
      return { result: { error: 'no-db' } }
    }
    if (!apiKey && !HAIKU_GENERATION_PAUSED) {
      emitOperationalEvent(createWideEvent({ operation: 'ai-generate-submit', outcome: 'credential-missing' }))
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('ai-generate-submit'),
    }, async () => {
      const startedAt = Date.now()
      return await runSubmit(db, ai, vectorize, apiKey)
        .then(async (result) => {
          const status = (result.result.errors?.length ?? 0) > 0 ? 'partial' : 'ok'
          await reportJobRun(db, 'ai-generate-submit', {
            cron: CRON,
            status,
            durationMs: Date.now() - startedAt,
            error: result.result.errors?.length ? result.result.errors.slice(0, 3).join('; ') : null,
          })
          return result
        })
        .catch(async (err) => {
          await reportJobRun(db, 'ai-generate-submit', {
            cron: CRON,
            status: 'error',
            durationMs: Date.now() - startedAt,
            error: (err as Error).message,
          })
          throw err
        })
    })
  },
})

async function runSubmit(db: D1Database, ai: AiBinding | undefined, vectorize: VectorizeBinding | undefined, apiKey: string | undefined) {
  const runtimeLimits = runtimeGenerationLimits({
    embedding: await countMissingEmbeddings(db),
  })
  const [embeddingSkills, abstractnessSkills, batchSkills] = await Promise.all([
    selectMissingGeneratedSkills(db, 'embedding', runtimeLimits.embedding),
    selectMissingGeneratedSkills(db, 'abstractness', runtimeLimits.abstractness),
    HAIKU_GENERATION_PAUSED
      ? Promise.resolve([])
      : selectMissingBatchSkills(db, BATCH_LIMIT),
  ])
  const scanned = new Set(
    [...embeddingSkills, ...abstractnessSkills, ...batchSkills]
      .map(skill => `${skill.owner}/${skill.repo}/${skill.name}`),
  ).size

  const summary = {
    scanned,
    embeddingPreflightFailures: 0,
    embeddingAttempts: 0,
    embeddingsWritten: 0,
    embeddingsProviderFailed: 0,
    embeddingsRejected: 0,
    embeddingsMarkerFailed: 0,
    abstractnessAttempts: 0,
    abstractnessWritten: 0,
    abstractnessProviderFailed: 0,
    abstractnessRejected: 0,
    abstractnessSourceChanged: 0,
    batchSubmitted: false,
    batchSize: 0,
    errors: [] as string[],
  }

  const embeddingPreflight = embeddingPreflightResult({
    eligible: embeddingSkills.length,
    hasAi: Boolean(ai),
    hasVectorize: Boolean(vectorize),
  })
  if (embeddingPreflight._tag === 'missing_bindings') {
    summary.embeddingPreflightFailures += 1
    summary.errors.push(embeddingPreflight.error)
  }

  if (abstractnessSkills.length > 0 && !ai)
    summary.errors.push('abstractness binding missing: ai')

  const recordEmbeddingResult = (skill: GenerationSkill, result: EmbeddingEffectResult) => {
    const effect = embeddingEffectSummary(result)
    summary.embeddingAttempts += 1
    summary.embeddingsWritten += effect.written
    summary.embeddingsProviderFailed += effect.providerFailed
    summary.embeddingsRejected += effect.rejected
    summary.embeddingsMarkerFailed += effect.markerFailed
    if (effect.error)
      summary.errors.push(`${skill.owner}/${skill.repo}/${skill.name}: ${effect.error}`)
  }

  const embeddingDeps: EmbeddingEffectDependencies | null = ai && vectorize
    ? {
        db,
        ai,
        vectorize,
        now: () => Math.floor(Date.now() / 1_000),
        newAttemptId: () => crypto.randomUUID(),
      }
    : null

  const runEmbedding = (deps: EmbeddingEffectDependencies, skill: GenerationSkill) => runEmbeddingEffect(deps, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    currentSha: skill.currentSha,
    renderedRaw: skill.renderedRaw,
  })

  if (embeddingDeps) {
    const results = await pAll(
      embeddingSkills,
      AI_CONCURRENCY,
      skill => runEmbedding(embeddingDeps, skill),
    )
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!
      if (result.status === 'rejected')
        throw result.reason
      recordEmbeddingResult(embeddingSkills[index]!, result.value)
    }
  }

  if (ai) {
    const results = await pAll(abstractnessSkills, AI_CONCURRENCY, async (skill) => {
      const provider = await ai.run(ABSTRACTNESS_MODEL, {
        messages: [
          { role: 'system', content: ABSTRACTNESS_SYSTEM_PROMPT },
          { role: 'user', content: buildAbstractnessUserPrompt(skill) },
        ],
        max_tokens: 128,
        temperature: 0,
        response_format: ABSTRACTNESS_RESPONSE_FORMAT,
      }).then(
        response => ({ _tag: 'response' as const, response }),
        error => ({
          _tag: 'provider_failed' as const,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      if (provider._tag === 'provider_failed')
        return provider

      const parsed = parseAbstractnessPayload(extractJson<unknown>(abstractnessResponseText(provider.response)))
      if (parsed._tag === 'error')
        return { _tag: 'rejected' as const, reason: parsed.reason }
      const persisted = await persistAbstractness(
        db,
        skill,
        parsed.value,
        Math.floor(Date.now() / 1_000),
      )
      return persisted
    })
    for (let index = 0; index < results.length; index++) {
      const result = results[index]!
      if (result.status === 'rejected')
        throw result.reason
      summary.abstractnessAttempts += 1
      if (result.value._tag === 'written') {
        summary.abstractnessWritten += 1
      }
      else if (result.value._tag === 'source_changed') {
        summary.abstractnessSourceChanged += 1
      }
      else if (result.value._tag === 'provider_failed') {
        summary.abstractnessProviderFailed += 1
        summary.errors.push(
          `abstract ${abstractnessSkills[index]!.owner}/${abstractnessSkills[index]!.repo}/${abstractnessSkills[index]!.name}: ${result.value.error}`,
        )
      }
      else {
        summary.abstractnessRejected += 1
        summary.errors.push(
          `abstract ${abstractnessSkills[index]!.owner}/${abstractnessSkills[index]!.repo}/${abstractnessSkills[index]!.name}: ${result.value.reason}`,
        )
      }
    }
  }

  if (apiKey && !HAIKU_GENERATION_PAUSED && batchSkills.length > 0) {
    const indexMap = batchSkills.map(skill => ({
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
      sha: skill.currentSha,
    }))
    const requests: BatchRequestItem[] = []
    for (let i = 0; i < batchSkills.length; i++) {
      const skill = batchSkills[i]!
      const body = skill.renderedRaw.slice(0, 12000)
      const displayName = skill.displayName || skill.name
      for (const kind of BATCH_KINDS) {
        const userPrompt = `Skill: ${skill.owner}/${skill.repo} — ${displayName}\nOutput kind: ${kind}\n\nSKILL.md content:\n\n${body}\n\nReturn the ${kind} output now, in the format specified by the system prompt.`
        requests.push({
          custom_id: encodeCustomId(i, kind),
          params: {
            model: HAIKU_MODEL,
            max_tokens: kind === 'faq' ? 1024 : kind === 'tags' ? 256 : 512,
            system: [{
              type: 'text',
              text: SHARED_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            }],
            messages: [{ role: 'user', content: userPrompt }],
          },
        })
      }
    }

    const res = await fetch(ANTHROPIC_BATCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ requests }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      summary.errors.push(`batch submit ${res.status}: ${body.slice(0, 300)}`)
    }
    else {
      const data = await res.json() as { id: string }
      const submittedAt = Math.floor(Date.now() / 1000)
      // Atomic: both rows commit or neither. Avoids paying for an
      // Anthropic batch with no D1 record to poll against.
      await db.batch([
        db
          .prepare(
            `INSERT INTO ai_batches (anthropic_batch_id, kinds, skill_count, status, submitted_at, index_map)
               VALUES (?, ?, ?, 'submitted', ?, ?)`,
          )
          .bind(
            data.id,
            JSON.stringify(BATCH_KINDS),
            batchSkills.length,
            submittedAt,
            JSON.stringify(indexMap),
          ),
        db
          .prepare(
            `INSERT INTO ai_batch_costs (anthropic_batch_id, skill_count, request_count, submitted_at)
               VALUES (?, ?, ?, ?)`,
          )
          .bind(data.id, batchSkills.length, requests.length, submittedAt),
      ])

      summary.batchSubmitted = true
      summary.batchSize = requests.length
    }
  }

  emitOperationalEvent(createWideEvent({
    'operation': 'ai-generate-submit',
    'outcome': summary.errors.length > 0 ? 'partial' : 'completed',
    'scanned.count': summary.scanned,
    'batch.count': summary.batchSize,
    'success.count': summary.embeddingsWritten + summary.abstractnessWritten,
    'error.count': summary.errors.length,
  }))
  return { result: summary }
}
