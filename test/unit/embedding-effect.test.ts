import type { EmbeddingEffectDependencies, EmbeddingSkill } from '../../layers/registry/server/utils/embedding-effect'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  embeddingEffectSummary,
  embeddingPreflightResult,
  runEmbeddingEffect,
} from '../../layers/registry/server/utils/embedding-effect'

const VECTOR_DIMENSIONS = 768

describe('embedding effect', () => {
  let sqlite: Database.Database
  let failNextMarkerBatch: boolean
  let failNextAttemptStart: boolean
  let db: D1Database
  let attemptSequence: number
  let vectors: Map<string, VectorizeVector>

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE skill_generated (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        sha TEXT NOT NULL,
        payload TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (owner, repo, name, kind)
      );
      CREATE TABLE embedding_attempts (
        attempt_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        vector_id TEXT NOT NULL,
        content_sha TEXT NOT NULL,
        state TEXT NOT NULL,
        provider_stage TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        error_code TEXT,
        error_message TEXT,
        provider_response TEXT
      );
    `)
    failNextMarkerBatch = false
    failNextAttemptStart = false
    db = wrapSqlite(sqlite, () => {
      if (!failNextMarkerBatch)
        return false
      failNextMarkerBatch = false
      return true
    }, () => {
      if (!failNextAttemptStart)
        return false
      failNextAttemptStart = false
      return true
    })
    attemptSequence = 0
    vectors = new Map()
  })

  afterEach(() => sqlite.close())

  it('writes no current marker when Vectorize rejects the upsert', async () => {
    const deps = makeDependencies({
      vectorizeUpsert: vi.fn(async () => ({ count: 0, ids: [] })),
    })

    const result = await runEmbeddingEffect(deps, skill())

    expect(result).toMatchObject({
      _tag: 'rejected',
      stage: 'vectorize',
      reason: 'malformed_acknowledgement',
    })
    expect(markerCount()).toBe(0)
    expect(latestAttempt()).toMatchObject({
      state: 'rejected',
      provider_stage: 'vectorize',
      error_code: 'malformed_acknowledgement',
    })
  })

  it('never calls AI or Vectorize when durable attempt insertion fails', async () => {
    const aiRun = vi.fn(async () => ({ data: [] }))
    const vectorizeUpsert = vi.fn(async () => ({ count: 1, ids: [] }))
    const deps = makeDependencies({ vectorizeUpsert })
    deps.ai.run = aiRun
    failNextAttemptStart = true

    await expect(runEmbeddingEffect(deps, skill())).rejects.toThrow('attempt insert unavailable')
    expect(aiRun).not.toHaveBeenCalled()
    expect(vectorizeUpsert).not.toHaveBeenCalled()
  })

  it('writes exactly one current marker after a confirmed upsert', async () => {
    const deps = makeDependencies()

    const result = await runEmbeddingEffect(deps, skill())

    expect(result).toMatchObject({ _tag: 'completed' })
    expect(markerCount()).toBe(1)
    expect(currentMarker()).toMatchObject({ sha: 'sha-current' })
    expect(latestAttempt()).toMatchObject({ state: 'completed', error_code: null })
  })

  it('retries the deterministic vector after marker persistence fails and restores parity', async () => {
    const upsert = vi.fn(async (input: VectorizeVector[]) => {
      for (const vector of input)
        vectors.set(vector.id, vector)
      return { mutationId: 'mutation-retry' }
    })
    const deps = makeDependencies({ vectorizeUpsert: upsert })
    failNextMarkerBatch = true

    const failed = await runEmbeddingEffect(deps, skill())
    const retried = await runEmbeddingEffect(deps, skill())

    expect(failed).toMatchObject({ _tag: 'vector_succeeded_marker_failed' })
    expect(retried).toMatchObject({ _tag: 'completed', vectorId: failed.vectorId })
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(new Set(upsert.mock.calls.map(call => call[0][0]!.id))).toHaveLength(1)
    expect(markerCount()).toBe(1)
    expect(sqlite.prepare(
      `SELECT state FROM embedding_attempts ORDER BY started_at, attempt_id`,
    ).all()).toEqual([
      { state: 'vector_succeeded_marker_failed' },
      { state: 'completed' },
    ])
  })

  it('retries after provider failure and restores the marker', async () => {
    const upsert = vi.fn()
      .mockRejectedValueOnce(new Error('Vectorize unavailable'))
      .mockImplementationOnce(async () => ({ mutationId: 'mutation-recover' }))
    const deps = makeDependencies({ vectorizeUpsert: upsert })

    const failed = await runEmbeddingEffect(deps, skill())
    const retried = await runEmbeddingEffect(deps, skill())

    expect(failed).toMatchObject({ _tag: 'provider_failed', stage: 'vectorize' })
    expect(retried).toMatchObject({ _tag: 'completed' })
    expect(markerCount()).toBe(1)
  })

  it('keeps repeated confirmed success idempotent', async () => {
    const upsert = vi.fn(async () => ({ mutationId: 'mutation-idempotent' }))
    const deps = makeDependencies({ vectorizeUpsert: upsert })

    const first = await runEmbeddingEffect(deps, skill())
    const second = await runEmbeddingEffect(deps, skill())

    expect(first).toMatchObject({ _tag: 'completed' })
    expect(second).toMatchObject({ _tag: 'completed', vectorId: first.vectorId })
    expect(markerCount()).toBe(1)
    expect(sqlite.prepare(
      `SELECT count(*) FROM embedding_attempts WHERE state = 'completed'`,
    ).pluck().get()).toBe(2)
  })

  it('turns an unexpected provider throw into a durable tagged failure', async () => {
    const deps = makeDependencies({
      vectorizeUpsert: vi.fn(async () => {
        throw new TypeError('provider transport exploded')
      }),
    })

    const result = await runEmbeddingEffect(deps, skill())

    expect(result).toMatchObject({
      _tag: 'provider_failed',
      stage: 'vectorize',
      error: 'provider transport exploded',
    })
    expect(markerCount()).toBe(0)
    expect(latestAttempt()).toMatchObject({ state: 'provider_failed' })
  })

  it('completes when Vectorize returns an async mutation acknowledgement', async () => {
    const deps = makeDependencies({
      vectorizeUpsert: vi.fn(async () => ({ mutationId: 'async-shape' })),
    })

    const result = await runEmbeddingEffect(deps, skill())

    expect(result).toMatchObject({ _tag: 'completed' })
    expect(markerCount()).toBe(1)
    expect(latestAttempt()).toMatchObject({ state: 'completed', error_code: null })
  })

  it.each([
    [{ count: 1, ids: ['wrong-id'] }],
    [{ mutationId: '' }],
    [{ mutationId: 123 }],
    [{}],
  ])('records a malformed provider acknowledgement %# as rejection', async (acknowledgement) => {
    const deps = makeDependencies({
      vectorizeUpsert: vi.fn(async () => acknowledgement),
    })

    const result = await runEmbeddingEffect(deps, skill())

    expect(result).toMatchObject({ _tag: 'rejected', stage: 'vectorize', reason: 'malformed_acknowledgement' })
    expect(markerCount()).toBe(0)
    expect(latestAttempt()).toMatchObject({ state: 'rejected', error_code: 'malformed_acknowledgement' })
  })

  it('summarizes every tagged failure explicitly for the scheduled task', () => {
    const common = { attemptId: 'attempt', vectorId: 'vector' }

    expect(embeddingEffectSummary({ _tag: 'completed', ...common })).toEqual({
      written: 1,
      providerFailed: 0,
      rejected: 0,
      markerFailed: 0,
      error: null,
    })
    expect(embeddingEffectSummary({
      _tag: 'provider_failed',
      ...common,
      stage: 'vectorize',
      error: 'unavailable',
    })).toMatchObject({ providerFailed: 1, error: 'embedding vectorize provider_failed: unavailable' })
    expect(embeddingEffectSummary({
      _tag: 'rejected',
      ...common,
      stage: 'vectorize',
      reason: 'malformed_acknowledgement',
    })).toMatchObject({ rejected: 1, error: 'embedding vectorize rejected: malformed_acknowledgement' })
    expect(embeddingEffectSummary({
      _tag: 'vector_succeeded_marker_failed',
      ...common,
      error: 'D1 unavailable',
    })).toMatchObject({ markerFailed: 1, error: 'embedding marker failed: D1 unavailable' })
  })

  it.each([
    [false, true, ['ai']],
    [true, false, ['vectorize']],
  ] as const)('reports missing binding preflight ai=%s vectorize=%s', (hasAi, hasVectorize, missing) => {
    expect(embeddingPreflightResult({ eligible: 1, hasAi, hasVectorize })).toEqual({
      _tag: 'missing_bindings',
      missing,
      error: `embedding bindings missing: ${missing.join(',')}`,
    })
  })

  function makeDependencies(overrides: {
    vectorizeUpsert?: (vectors: VectorizeVector[]) => Promise<unknown>
  } = {}): EmbeddingEffectDependencies {
    return {
      db,
      ai: {
        run: vi.fn(async () => ({
          data: [Array.from({ length: VECTOR_DIMENSIONS }).fill(0.25)],
          shape: [1, VECTOR_DIMENSIONS],
        })),
      },
      vectorize: {
        upsert: overrides.vectorizeUpsert ?? (async (input) => {
          for (const vector of input)
            vectors.set(vector.id, vector)
          return { mutationId: 'mutation-default' }
        }),
      },
      now: () => 1_000 + attemptSequence,
      newAttemptId: () => `attempt-${++attemptSequence}`,
    }
  }

  function markerCount(): number {
    return sqlite.prepare(
      `SELECT count(*) FROM skill_generated WHERE kind = 'embedding'`,
    ).pluck().get() as number
  }

  function currentMarker(): Record<string, unknown> | undefined {
    return sqlite.prepare(
      `SELECT sha, payload FROM skill_generated WHERE kind = 'embedding'`,
    ).get() as Record<string, unknown> | undefined
  }

  function latestAttempt(): Record<string, unknown> | undefined {
    return sqlite.prepare(
      `SELECT * FROM embedding_attempts ORDER BY started_at DESC, attempt_id DESC LIMIT 1`,
    ).get() as Record<string, unknown> | undefined
  }
})

function skill(): EmbeddingSkill {
  return {
    owner: 'acme',
    repo: 'skills',
    name: 'one',
    currentSha: 'sha-current',
    renderedRaw: '# Skill\nUseful instructions.',
  }
}

interface StoredStatement {
  sql: string
  params: unknown[]
}

function wrapSqlite(
  sqlite: Database.Database,
  shouldFailMarkerBatch: () => boolean,
  shouldFailAttemptStart: () => boolean,
): D1Database {
  const prepare = (sql: string) => {
    const makeStatement = (params: unknown[]): D1PreparedStatement & StoredStatement => ({
      sql,
      params,
      bind: (...nextParams: unknown[]) => makeStatement(nextParams),
      async run() {
        if (sql.includes('INSERT INTO embedding_attempts') && shouldFailAttemptStart())
          throw new Error('attempt insert unavailable')
        const result = sqlite.prepare(sql).run(...params)
        return { meta: { changes: result.changes } } as D1Result
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...params) as T[] } as D1Result<T>
      },
    } as unknown as D1PreparedStatement & StoredStatement)
    return makeStatement([])
  }

  return {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      if (statements.some(statement => (statement as unknown as StoredStatement).sql.includes('skill_generated'))
        && shouldFailMarkerBatch()) {
        throw new Error('marker transaction unavailable')
      }
      return sqlite.transaction(() => statements.map((statement) => {
        const stored = statement as unknown as StoredStatement
        const result = sqlite.prepare(stored.sql).run(...stored.params)
        return { meta: { changes: result.changes } } as D1Result
      }))()
    },
  } as unknown as D1Database
}
