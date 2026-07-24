/// <reference types="@cloudflare/workers-types" />

import { vectorIdFor } from './vector-id'

export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
export const EMBEDDING_VECTOR_DIMENSIONS = 768

export interface EmbeddingSkill {
  owner: string
  repo: string
  name: string
  currentSha: string
  renderedRaw: string
}

export interface EmbeddingAiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

export interface EmbeddingVectorizeBinding {
  upsert: (vectors: VectorizeVector[]) => Promise<unknown>
}

export interface EmbeddingEffectDependencies {
  db: D1Database
  ai: EmbeddingAiBinding
  vectorize: EmbeddingVectorizeBinding
  now: () => number
  newAttemptId: () => string
}

export type EmbeddingEffectResult
  = | { _tag: 'completed', attemptId: string, vectorId: string }
    | {
      _tag: 'provider_failed'
      attemptId: string
      vectorId: string
      stage: 'ai' | 'vectorize'
      error: string
    }
    | {
      _tag: 'rejected'
      attemptId: string
      vectorId: string
      stage: 'ai' | 'vectorize'
      reason: 'malformed_embedding' | 'malformed_acknowledgement'
    }
    | {
      _tag: 'vector_succeeded_marker_failed'
      attemptId: string
      vectorId: string
      error: string
    }

export interface EmbeddingEffectSummary {
  written: number
  providerFailed: number
  rejected: number
  markerFailed: number
  error: string | null
}

export type EmbeddingPreflightResult
  = | { _tag: 'ready' }
    | { _tag: 'no_eligible_work' }
    | {
      _tag: 'missing_bindings'
      missing: Array<'ai' | 'vectorize'>
      error: string
    }

type ExpectedFailureState = 'provider_failed' | 'rejected' | 'vector_succeeded_marker_failed'
type ProviderStage = 'ai' | 'vectorize' | 'marker'

interface FailureDetails {
  state: ExpectedFailureState
  stage: ProviderStage
  code: string
  message: string
  providerResponse?: unknown
}

type ParseResult<T>
  = | { _tag: 'ok', value: T }
    | { _tag: 'error', reason: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function embeddingPreflightResult(input: {
  eligible: number
  hasAi: boolean
  hasVectorize: boolean
}): EmbeddingPreflightResult {
  if (input.eligible === 0)
    return { _tag: 'no_eligible_work' }
  const missing: Array<'ai' | 'vectorize'> = []
  if (!input.hasAi)
    missing.push('ai')
  if (!input.hasVectorize)
    missing.push('vectorize')
  if (missing.length) {
    return {
      _tag: 'missing_bindings',
      missing,
      error: `embedding bindings missing: ${missing.join(',')}`,
    }
  }
  return { _tag: 'ready' }
}

export function embeddingEffectSummary(result: EmbeddingEffectResult): EmbeddingEffectSummary {
  if (result._tag === 'completed') {
    return {
      written: 1,
      providerFailed: 0,
      rejected: 0,
      markerFailed: 0,
      error: null,
    }
  }
  if (result._tag === 'provider_failed') {
    return {
      written: 0,
      providerFailed: 1,
      rejected: 0,
      markerFailed: 0,
      error: `embedding ${result.stage} provider_failed: ${result.error}`,
    }
  }
  if (result._tag === 'rejected') {
    return {
      written: 0,
      providerFailed: 0,
      rejected: 1,
      markerFailed: 0,
      error: `embedding ${result.stage} rejected: ${result.reason}`,
    }
  }
  return {
    written: 0,
    providerFailed: 0,
    rejected: 0,
    markerFailed: 1,
    error: `embedding marker failed: ${result.error}`,
  }
}

function parseEmbeddingResponse(value: unknown): ParseResult<number[]> {
  if (typeof value !== 'object' || value === null || !('data' in value) || !Array.isArray(value.data))
    return { _tag: 'error', reason: 'Embedding response has no data array' }
  const vector = value.data[0]
  if (!Array.isArray(vector)
    || vector.length !== EMBEDDING_VECTOR_DIMENSIONS
    || vector.some(component => typeof component !== 'number' || !Number.isFinite(component))) {
    return { _tag: 'error', reason: `Embedding response must contain ${EMBEDDING_VECTOR_DIMENSIONS} finite numbers` }
  }
  return { _tag: 'ok', value: vector }
}

// Vectorize V2 upsert is asynchronous: it returns { mutationId } acknowledging
// the write is queued, not a synchronous { count, ids }. A non-empty mutationId
// is the acknowledgement; the vector becomes queryable shortly after.
function parseVectorizeAcknowledgement(
  value: unknown,
): ParseResult<'confirmed'> {
  if (typeof value !== 'object'
    || value === null
    || !('mutationId' in value)
    || typeof value.mutationId !== 'string'
    || value.mutationId.length === 0) {
    return { _tag: 'error', reason: 'malformed_acknowledgement' }
  }
  return { _tag: 'ok', value: 'confirmed' }
}

function diagnosticResponse(value: unknown): string {
  try {
    return (JSON.stringify(value, (_key, nested) => typeof nested === 'bigint' ? nested.toString() : nested) ?? String(value)).slice(0, 2_000)
  }
  catch (error) {
    return `unserializable_provider_response:${errorMessage(error)}`
  }
}

async function startAttempt(
  deps: EmbeddingEffectDependencies,
  skill: EmbeddingSkill,
  attemptId: string,
  vectorId: string,
  startedAt: number,
): Promise<void> {
  await deps.db.prepare(
    `INSERT INTO embedding_attempts (
       attempt_id, owner, repo, name, vector_id, content_sha, state, started_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'started', ?)`,
  ).bind(
    attemptId,
    skill.owner,
    skill.repo,
    skill.name,
    vectorId,
    skill.currentSha,
    startedAt,
  ).run()
}

async function recordFailure(
  deps: EmbeddingEffectDependencies,
  attemptId: string,
  details: FailureDetails,
): Promise<void> {
  const result = await deps.db.prepare(
    `UPDATE embedding_attempts
     SET state = ?,
         provider_stage = ?,
         finished_at = ?,
         error_code = ?,
         error_message = ?,
         provider_response = ?
     WHERE attempt_id = ? AND state = 'started'`,
  ).bind(
    details.state,
    details.stage,
    deps.now(),
    details.code,
    details.message,
    details.providerResponse === undefined ? null : diagnosticResponse(details.providerResponse),
    attemptId,
  ).run()
  if (!result.meta?.changes)
    throw new Error(`Embedding attempt ${attemptId} could not record ${details.state}`)
}

async function persistMarkerAndCompletion(
  deps: EmbeddingEffectDependencies,
  skill: EmbeddingSkill,
  attemptId: string,
  vectorId: string,
): Promise<void> {
  const finishedAt = deps.now()
  const generatedAt = new Date(finishedAt * 1_000).toISOString()
  const results = await deps.db.batch([
    deps.db.prepare(
      `INSERT INTO skill_generated (owner, repo, name, kind, sha, payload, generated_at)
       VALUES (?, ?, ?, 'embedding', ?, ?, ?)
       ON CONFLICT(owner, repo, name, kind) DO UPDATE SET
         sha = excluded.sha,
         payload = excluded.payload,
         generated_at = excluded.generated_at`,
    ).bind(
      skill.owner,
      skill.repo,
      skill.name,
      skill.currentSha,
      JSON.stringify({
        stored_in: 'vectorize',
        dim: EMBEDDING_VECTOR_DIMENSIONS,
        vector_id: vectorId,
      }),
      generatedAt,
    ),
    deps.db.prepare(
      `UPDATE embedding_attempts
       SET state = 'completed', finished_at = ?
       WHERE attempt_id = ? AND state = 'started'`,
    ).bind(finishedAt, attemptId),
  ])
  if (!results[1]?.meta?.changes)
    throw new Error(`Embedding attempt ${attemptId} could not record completion`)
}

export async function runEmbeddingEffect(
  deps: EmbeddingEffectDependencies,
  skill: EmbeddingSkill,
): Promise<EmbeddingEffectResult> {
  const vectorId = await vectorIdFor(skill)
  const attemptId = deps.newAttemptId()
  await startAttempt(deps, skill, attemptId, vectorId, deps.now())

  const embeddingOutcome = await deps.ai.run(EMBEDDING_MODEL, {
    text: [skill.renderedRaw.slice(0, 8_000)],
  }).then(
    response => ({ _tag: 'response' as const, response }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  if (embeddingOutcome._tag === 'failure') {
    await recordFailure(deps, attemptId, {
      state: 'provider_failed',
      stage: 'ai',
      code: 'provider_error',
      message: embeddingOutcome.error,
    })
    return {
      _tag: 'provider_failed',
      attemptId,
      vectorId,
      stage: 'ai',
      error: embeddingOutcome.error,
    }
  }

  const embedding = parseEmbeddingResponse(embeddingOutcome.response)
  if (embedding._tag === 'error') {
    await recordFailure(deps, attemptId, {
      state: 'rejected',
      stage: 'ai',
      code: 'malformed_embedding',
      message: embedding.reason,
      providerResponse: embeddingOutcome.response,
    })
    return {
      _tag: 'rejected',
      attemptId,
      vectorId,
      stage: 'ai',
      reason: 'malformed_embedding',
    }
  }

  const acknowledgementOutcome = await deps.vectorize.upsert([{
    id: vectorId,
    values: embedding.value,
    metadata: {
      sha: skill.currentSha,
      owner: skill.owner,
      repo: skill.repo,
      name: skill.name,
    },
  }]).then(
    response => ({ _tag: 'response' as const, response }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  if (acknowledgementOutcome._tag === 'failure') {
    await recordFailure(deps, attemptId, {
      state: 'provider_failed',
      stage: 'vectorize',
      code: 'provider_error',
      message: acknowledgementOutcome.error,
    })
    return {
      _tag: 'provider_failed',
      attemptId,
      vectorId,
      stage: 'vectorize',
      error: acknowledgementOutcome.error,
    }
  }

  const acknowledgement = parseVectorizeAcknowledgement(acknowledgementOutcome.response)
  if (acknowledgement._tag === 'error') {
    await recordFailure(deps, attemptId, {
      state: 'rejected',
      stage: 'vectorize',
      code: 'malformed_acknowledgement',
      message: 'Vectorize upsert malformed_acknowledgement',
      providerResponse: acknowledgementOutcome.response,
    })
    return { _tag: 'rejected', attemptId, vectorId, stage: 'vectorize', reason: 'malformed_acknowledgement' }
  }

  const markerOutcome = await persistMarkerAndCompletion(deps, skill, attemptId, vectorId).then(
    () => ({ _tag: 'persisted' as const }),
    error => ({ _tag: 'failure' as const, error: errorMessage(error) }),
  )
  if (markerOutcome._tag === 'failure') {
    await recordFailure(deps, attemptId, {
      state: 'vector_succeeded_marker_failed',
      stage: 'marker',
      code: 'marker_persistence_failed',
      message: markerOutcome.error,
    })
    return {
      _tag: 'vector_succeeded_marker_failed',
      attemptId,
      vectorId,
      error: markerOutcome.error,
    }
  }

  return { _tag: 'completed', attemptId, vectorId }
}
