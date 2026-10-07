import type { BehaviorReading } from '#shared/behavior-readings'
import type { CheckResult, ResolvedSource } from '../schemas/contracts'
import type { BehaviorHit, BehaviorReviewKey, BehaviorReviewOutcome, BehaviorReviewRequest, CollectedBehaviorHits, ReviewUsage } from './behavior-review'
import { z } from 'zod'
import { BEHAVIOR_VERDICTS } from '#shared/behavior-readings'
import {
  BEHAVIOR_REVIEW_MODEL,
  behaviorHitsDigest,
  behaviorReviewCheck,
  behaviorReviewCostMicros,
  behaviorReviewKey,
  behaviorReviewRequest,
  currentBehaviorRulesVersion,
  parseBehaviorReadings,
} from './behavior-review'

export interface BehaviorReviewInput {
  source: ResolvedSource
  collected: CollectedBehaviorHits
}

/** The `behavior-review` check result for one build. It never throws for a model fault. */
export type BehaviorReviewer = (input: BehaviorReviewInput) => Promise<CheckResult>

export type BehaviorReviewReport
  /** A stored review served: of this commit, or of another build with the same input. */
  = | { _tag: 'stored', hits: number, from: 'same-commit' | 'same-input' }
    | { _tag: 'read', hits: number, usage: ReviewUsage, costMicros: number, latencyMs: number, invalid: boolean }
    | { _tag: 'unread', hits: number, reason: Extract<BehaviorReviewOutcome, { _tag: 'unread' }>['reason'], detail: string | null }
    | { _tag: 'store-failed', reason: string }

export interface BehaviorReviewerDependencies {
  db: D1Database
  /** One model call. Resolves with the raw reply, which is untrusted. Null means no model is bound. */
  model: ((request: BehaviorReviewRequest) => Promise<unknown>) | null
  /** A fresh delimiter nonce for each request. */
  nonce: () => string
  /** Milliseconds since the epoch. */
  clock: () => number
  timeoutMs: number
  report: (report: BehaviorReviewReport) => void
}

/**
 * The longest a build waits for the model. A build of a Skill whose matches
 * no stored review covers waits this long at most, once per commit. Measured
 * on 2026-10-07 over 50 Skills; see ADR-0016.
 */
export const BEHAVIOR_REVIEW_TIMEOUT_MS = 8_000

/**
 * Reads the matches of one build: a stored review of the same commit and
 * matches, else one model call. A model that fails, times out, or is not
 * bound gives an `error` result, which blocks nothing.
 */
export function createBehaviorReviewer(dependencies: BehaviorReviewerDependencies): BehaviorReviewer {
  return async ({ source, collected }) => {
    if (collected._tag === 'failed') {
      dependencies.report({ _tag: 'unread', hits: 0, reason: 'matcher-failed', detail: collected.reason })
      return behaviorReviewCheck({ _tag: 'unread', reason: 'matcher-failed' })
    }
    const { hits } = collected
    const settled = settledWithoutModel(source, hits)
    if (settled)
      return behaviorReviewCheck(settled)

    const key = behaviorReviewKey(source)
    const digest = behaviorHitsDigest(hits)
    const stored = await loadStoredReadings(dependencies.db, key, digest)
    if (stored) {
      dependencies.report({ _tag: 'stored', hits: hits.length, from: 'same-commit' })
      return behaviorReviewCheck({ _tag: 'read', readings: stored })
    }
    const shared = await loadReadingsForInput(dependencies.db, key.rulesVersion, digest)
    if (shared) {
      await storeReadings(dependencies.db, {
        key,
        digest,
        skillMdBlobSha: collected.skillMdBlobSha,
        readings: shared,
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0 },
        costMicros: 0,
        latencyMs: 0,
        now: Math.floor(dependencies.clock() / 1000),
      }).catch((error: unknown) => {
        // The readings still serve this build. The next build copies them again.
        dependencies.report({ _tag: 'store-failed', reason: error instanceof Error ? error.message : String(error) })
      })
      dependencies.report({ _tag: 'stored', hits: hits.length, from: 'same-input' })
      return behaviorReviewCheck({ _tag: 'read', readings: shared })
    }
    if (!dependencies.model) {
      dependencies.report({ _tag: 'unread', hits: hits.length, reason: 'unavailable', detail: null })
      return behaviorReviewCheck({ _tag: 'unread', reason: 'unavailable' })
    }

    const started = dependencies.clock()
    const reply = await callWithTimeout(dependencies.model(behaviorReviewRequest(hits, dependencies.nonce())), dependencies.timeoutMs)
    const latencyMs = dependencies.clock() - started
    if (reply._tag !== 'reply') {
      dependencies.report({ _tag: 'unread', hits: hits.length, reason: reply._tag, detail: reply._tag === 'model-error' ? reply.detail : null })
      return behaviorReviewCheck({ _tag: 'unread', reason: reply._tag })
    }
    const parsed = parseBehaviorReadings(reply.value, hits)
    const costMicros = behaviorReviewCostMicros(parsed.usage)
    dependencies.report({ _tag: 'read', hits: hits.length, usage: parsed.usage, costMicros, latencyMs, invalid: parsed._tag === 'invalid' })
    // A reply outside the schema reads `unclear` for this build, and is not
    // kept: the next build of the commit asks again.
    if (parsed._tag === 'parsed') {
      await storeReadings(dependencies.db, {
        key,
        digest,
        skillMdBlobSha: collected.skillMdBlobSha,
        readings: parsed.readings,
        usage: parsed.usage,
        costMicros,
        latencyMs,
        now: Math.floor(dependencies.clock() / 1000),
      }).catch((error: unknown) => {
        // The readings still serve this build. The next build asks again.
        dependencies.report({ _tag: 'store-failed', reason: error instanceof Error ? error.message : String(error) })
      })
    }
    return behaviorReviewCheck({ _tag: 'read', readings: parsed.readings })
  }
}

/**
 * The outcome when the model has nothing to read: nothing needs approval, or
 * the Skill is private. Null means the model reads.
 */
function settledWithoutModel(source: ResolvedSource, hits: readonly BehaviorHit[]): BehaviorReviewOutcome | null {
  if (hits.length === 0)
    return { _tag: 'no-matches' }
  if (source.visibility === 'private')
    return { _tag: 'private' }
  return null
}

/**
 * The review a build makes with no model bound, as in tests and local
 * builds: every match is left unread.
 */
export const reviewWithoutModel: BehaviorReviewer = async ({ source, collected }) =>
  behaviorReviewCheck(collected._tag === 'failed'
    ? { _tag: 'unread', reason: 'matcher-failed' }
    : settledWithoutModel(source, collected.hits) ?? { _tag: 'unread', reason: 'unavailable' })

type ModelReply
  = | { _tag: 'reply', value: unknown }
    | { _tag: 'timeout' }
    | { _tag: 'model-error', detail: string }

async function callWithTimeout(call: Promise<unknown>, timeoutMs: number): Promise<ModelReply> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<ModelReply>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, { _tag: 'timeout' })
  })
  const reply = call.then(
    (value): ModelReply => ({ _tag: 'reply', value }),
    (error: unknown): ModelReply => ({ _tag: 'model-error', detail: error instanceof Error ? error.message : String(error) }),
  )
  try {
    return await Promise.race([reply, timeout])
  }
  finally {
    clearTimeout(timer)
  }
}

const storedReadingsSchema = z.array(z.object({
  path: z.string(),
  line: z.number().int().positive(),
  behavior: z.string(),
  lineHash: z.string(),
  verdict: z.enum(BEHAVIOR_VERDICTS),
  reason: z.string().nullable(),
}).strict())

function parseStoredReadings(value: string): BehaviorReading[] | null {
  try {
    const parsed = storedReadingsSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  }
  catch {
    // A row that is not JSON cannot serve. The review asks the model and replaces it.
    return null
  }
}

async function loadStoredReadings(db: D1Database, key: BehaviorReviewKey, digest: string): Promise<BehaviorReading[] | null> {
  const row = await db.prepare(
    `SELECT hits_digest, readings_json FROM behavior_reviews
     WHERE repository_id = ?1 AND commit_sha = ?2 AND skill_path = ?3 AND rules_version = ?4`,
  ).bind(key.repositoryId, key.commitSha, key.skillPath, key.rulesVersion).first<{ hits_digest: string, readings_json: string }>()
  if (!row || row.hits_digest !== digest)
    return null
  return parseStoredReadings(row.readings_json)
}

/** The readings of any build that sent the model the same input, under the same rules. */
async function loadReadingsForInput(db: D1Database, rulesVersion: string, digest: string): Promise<BehaviorReading[] | null> {
  const row = await db.prepare(
    `SELECT readings_json FROM behavior_reviews
     WHERE hits_digest = ?1 AND rules_version = ?2
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(digest, rulesVersion).first<{ readings_json: string }>()
  return row ? parseStoredReadings(row.readings_json) : null
}

async function storeReadings(db: D1Database, input: {
  key: BehaviorReviewKey
  digest: string
  skillMdBlobSha: string | null
  readings: BehaviorReading[]
  usage: ReviewUsage
  costMicros: number
  latencyMs: number
  now: number
}): Promise<void> {
  await db.prepare(
    `INSERT INTO behavior_reviews (
       repository_id, commit_sha, skill_path, rules_version, hits_digest, skill_md_blob_sha,
       model, readings_json, input_tokens, cached_tokens, output_tokens, cost_micros, latency_ms, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
     ON CONFLICT (repository_id, commit_sha, skill_path, rules_version) DO UPDATE SET
       hits_digest = excluded.hits_digest,
       skill_md_blob_sha = excluded.skill_md_blob_sha,
       model = excluded.model,
       readings_json = excluded.readings_json,
       input_tokens = excluded.input_tokens,
       cached_tokens = excluded.cached_tokens,
       output_tokens = excluded.output_tokens,
       cost_micros = excluded.cost_micros,
       latency_ms = excluded.latency_ms,
       created_at = excluded.created_at`,
  ).bind(
    input.key.repositoryId,
    input.key.commitSha,
    input.key.skillPath,
    input.key.rulesVersion,
    input.digest,
    input.skillMdBlobSha,
    BEHAVIOR_REVIEW_MODEL,
    JSON.stringify(input.readings),
    input.usage.inputTokens,
    input.usage.cachedTokens,
    input.usage.outputTokens,
    input.costMicros,
    input.latencyMs,
    input.now,
  ).run()
}

/**
 * The newest SKILL.md readings for one SKILL.md blob, under the rules this
 * deploy reads with. The Skill page shows them beside its own matches.
 */
export async function loadSkillMdReadings(db: D1Database, skillMdBlobSha: string): Promise<BehaviorReading[]> {
  const row = await db.prepare(
    `SELECT readings_json FROM behavior_reviews
     WHERE skill_md_blob_sha = ?1 AND rules_version = ?2
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(skillMdBlobSha, currentBehaviorRulesVersion()).first<{ readings_json: string }>()
  return (row ? parseStoredReadings(row.readings_json) ?? [] : []).filter(reading => reading.path === 'SKILL.md')
}
