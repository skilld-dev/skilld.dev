import type { SourceRequest } from '../../layers/artifact-delivery/server/schemas/contracts'
import type { ArtifactBuildOutcome } from '../../layers/artifact-delivery/server/utils/build'
import type { ResolutionRow } from '../../layers/artifact-delivery/server/utils/state'
import { createApp, createError, eventHandler, readBody, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failResolution } from '../../layers/artifact-delivery/server/utils/build'
import { bytesToBase64Url } from '../../layers/artifact-delivery/server/utils/encoding'
import { buildAfterResponse, IN_REQUEST_BUILD_FALLBACK_SECONDS } from '../../layers/artifact-delivery/server/utils/request-resolution'
import {
  RESOLUTION_CHECK_MS,
  RESOLUTION_WAIT_MS,
  waitForResolutionChange,
} from '../../layers/artifact-delivery/server/utils/resolution-wait'
import {
  createResolution,
  getResolution,
  presentResolution,
  resolutionRequestIdentity,
} from '../../layers/artifact-delivery/server/utils/state'
import { createSqliteD1 } from './helpers/d1-sqlite'

const NOW = 1_787_227_200
const request: SourceRequest = {
  provider: 'github',
  owner: 'skilld-dev',
  repository: 'skills',
  selector: { type: 'named-skill', name: 'demo' },
}

const MIGRATIONS = [
  'migrations/0017_users.sql',
  'migrations/0110_artifact_delivery.sql',
  'migrations/0111_github_app_delivery.sql',
  'migrations/0122_artifact_resolution_retry_after.sql',
]

async function requestedRow(): Promise<ResolutionRow> {
  const sqlite = createSqliteD1(MIGRATIONS)
  const identity = await resolutionRequestIdentity(request, 'resolution-wait-test-key')
  const created = await createResolution(sqlite.db, request, identity, NOW)
  sqlite.close()
  if (created._tag === 'idempotency-conflict')
    throw new Error('Test Resolution conflicted')
  return created.row
}

/** A clock that only moves when the wait sleeps, and a row that changes on a schedule. */
function scripted(states: Array<{ atMs: number, row: ResolutionRow }>) {
  let clock = 0
  let loads = 0
  return {
    loads: () => loads,
    elapsed: () => clock,
    dependencies: {
      now: () => clock,
      sleep: async (milliseconds: number) => {
        clock += milliseconds
      },
      load: async () => {
        loads += 1
        return states.filter(state => state.atMs <= clock).at(-1)?.row ?? null
      },
    },
  }
}

describe('waiting for a Resolution to move', () => {
  it('answers within one check after the build changes state', async () => {
    const requested = await requestedRow()
    const resolving = { ...requested, state: 'resolving' as const, state_version: 1 }
    const run = scripted([{ atMs: 0, row: requested }, { atMs: 1_100, row: resolving }])

    const answer = await waitForResolutionChange(run.dependencies, requested)

    expect(answer.state).toBe('resolving')
    expect(run.elapsed()).toBe(1_250)
    expect(run.elapsed() - 1_100).toBeLessThanOrEqual(RESOLUTION_CHECK_MS)
  })

  it('answers a settled Resolution at once', async () => {
    const ready = { ...(await requestedRow()), state: 'ready' as const }
    const run = scripted([{ atMs: 0, row: ready }])

    const answer = await waitForResolutionChange(run.dependencies, ready)

    expect(answer).toBe(ready)
    expect(run.loads()).toBe(0)
  })

  it('answers the unchanged Resolution when the wait runs out', async () => {
    const requested = await requestedRow()
    const run = scripted([{ atMs: 0, row: requested }])

    const answer = await waitForResolutionChange(run.dependencies, requested)

    expect(answer.state).toBe('requested')
    expect(run.elapsed()).toBe(RESOLUTION_WAIT_MS)
  })

  it('keeps waiting through a write that leaves the state as it was', async () => {
    const signing = { ...(await requestedRow()), state: 'signing' as const, state_version: 5 }
    const staged = { ...signing, state_version: 6 }
    const publishing = { ...signing, state: 'publishing' as const, state_version: 7 }
    const run = scripted([
      { atMs: 0, row: signing },
      { atMs: 300, row: staged },
      { atMs: 900, row: publishing },
    ])

    const answer = await waitForResolutionChange(run.dependencies, signing)

    expect(answer.state).toBe('publishing')
    expect(run.elapsed()).toBe(1_000)
  })
})

describe('building in the request after the response', () => {
  const ID = '6d3c8f1e-8d5f-4a43-9f0e-2a5e1d4b7c11'

  function harness(options: {
    build?: (resolutionId: string) => Promise<ArtifactBuildOutcome>
    enqueue?: (resolutionId: string, delaySeconds?: number) => Promise<void>
  } = {}) {
    const scheduled: Array<Promise<unknown>> = []
    const enqueue = vi.fn(options.enqueue ?? (async () => {}))
    const failUnqueued = vi.fn(async () => {})
    const reportBuildError = vi.fn()
    const start = buildAfterResponse({
      schedule: work => scheduled.push(work),
      build: options.build ?? (async resolutionId => ({ _tag: 'ready', resolutionId })),
      enqueue,
      failUnqueued,
      reportBuildError,
    })
    return { start, enqueue, failUnqueued, reportBuildError, settle: () => Promise.all(scheduled), scheduled }
  }

  it('answers before the build runs', async () => {
    let release = () => {}
    const built = new Promise<void>((resolve) => {
      release = resolve
    })
    const run = harness({ build: async (resolutionId) => {
      await built
      return { _tag: 'ready', resolutionId }
    } })

    await run.start(ID)

    expect(run.scheduled).toHaveLength(1)
    release()
    await run.settle()
  })

  it('builds in the request and leaves only the delayed fallback on the queue', async () => {
    const build = vi.fn(async (resolutionId: string) => ({ _tag: 'ready' as const, resolutionId }))
    const run = harness({ build })

    await run.start(ID)
    await run.settle()

    expect(build).toHaveBeenCalledWith(ID)
    expect(run.enqueue.mock.calls).toEqual([[ID, IN_REQUEST_BUILD_FALLBACK_SECONDS]])
  })

  it('sends a build that throws to the queue at once', async () => {
    const run = harness({ build: async () => {
      throw new Error('GitHub read failed at tree: The operation was aborted due to timeout')
    } })

    await run.start(ID)
    await run.settle()

    expect(run.enqueue.mock.calls).toEqual([[ID, IN_REQUEST_BUILD_FALLBACK_SECONDS], [ID, undefined]])
    expect(run.reportBuildError).toHaveBeenCalledOnce()
    expect(run.failUnqueued).not.toHaveBeenCalled()
  })

  it('puts a build that follows an earlier one back on the queue after the wait it names', async () => {
    const run = harness({ build: async resolutionId => ({ _tag: 'deferred', resolutionId, delaySeconds: 2 }) })

    await run.start(ID)
    await run.settle()

    expect(run.enqueue.mock.calls).toEqual([[ID, IN_REQUEST_BUILD_FALLBACK_SECONDS], [ID, 2]])
  })

  it('fails the Resolution as retryable when neither the request nor the queue can build it', async () => {
    const sqlite = createSqliteD1(MIGRATIONS)
    const identity = await resolutionRequestIdentity(request, 'resolution-build-test-key')
    const created = await createResolution(sqlite.db, request, identity, NOW)
    if (created._tag === 'idempotency-conflict')
      throw new Error('Test Resolution conflicted')
    const scheduled: Array<Promise<unknown>> = []
    const start = buildAfterResponse({
      schedule: work => scheduled.push(work),
      build: async () => {
        throw new Error('D1_ERROR: Network connection lost.')
      },
      enqueue: async () => {
        throw new Error('Queue send failed: 503')
      },
      failUnqueued: async (resolutionId) => {
        const row = await getResolution(sqlite.db, resolutionId)
        if (row)
          await failResolution({ db: sqlite.db, now: () => NOW }, row, 'SERVICE_UNAVAILABLE', true)
      },
      reportBuildError: () => {},
    })

    await start(created.row.id)
    await Promise.all(scheduled)

    const settled = await getResolution(sqlite.db, created.row.id)
    expect(presentResolution(settled!)).toMatchObject({
      state: 'failed',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })
    sqlite.close()
  })

  it('keeps a build that threw on the delayed fallback when the second send fails', async () => {
    let sends = 0
    const run = harness({
      build: async () => {
        throw new Error('The operation was aborted due to timeout')
      },
      enqueue: async () => {
        sends += 1
        if (sends > 1)
          throw new Error('Queue send failed: 503')
      },
    })

    await run.start(ID)
    await run.settle()

    expect(run.failUnqueued).not.toHaveBeenCalled()
  })
})

describe('pOST /api/v1/resolutions builds from the real event', () => {
  beforeEach(() => {
    vi.resetModules()
    // `defineApiHandler` reads Nuxt auto-imports, so the route needs them before it loads.
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('readBody', readBody)
    // The route reports a failed build through `console.error`; the tests assert the queue flow.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('answers 202 and schedules the build off the h3 event', async () => {
    const postResolutions = (await import(
      '../../layers/artifact-delivery/server/api/v1/resolutions/index.post',
    )).default
    const sqlite = createSqliteD1(MIGRATIONS)
    const sent: Array<{ version: number, resolutionId: string, delaySeconds?: number }> = []
    const app = createApp()
    app.use(eventHandler((event) => {
      event.context.platform = {
        db: sqlite.db,
        env: {
          ARTIFACT_BUILD_QUEUE: {
            send: async (message: { version: number, resolutionId: string }, options?: { delaySeconds?: number }) => {
              sent.push({ ...message, delaySeconds: options?.delaySeconds })
            },
          },
          ARTIFACT_TRUSTED_ROOT_JSON: trustedRootConfig(),
        },
      } as never
    }))
    app.use(postResolutions)
    const handle = toWebHandler(app)

    const response = await handle(new Request('http://localhost/api/v1/resolutions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'post-route-build-test-key' },
      // A path selector asks no registry lookup, so the route's HTTP seam stays out of this test.
      body: JSON.stringify({ source: { provider: 'github', owner: 'skilld-dev', repository: 'skills', selector: { type: 'path', path: 'skills/demo' } } }),
    }))

    expect(response.status).toBe(202)
    expect(response.headers.get('content-type')).not.toBe('application/problem+json')
    const body = await response.json()
    expect(body).toMatchObject({ state: 'pending', stage: 'requested', pollAfterMs: 250 })

    // The build runs after the response. This env has no database, so the
    // build throws: the delayed fallback goes out first, and the failure
    // re-queues the build at once for its retry ladder.
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[0]?.resolutionId).toBe(body.resolutionId)
    expect(sent[0]?.delaySeconds).toBe(IN_REQUEST_BUILD_FALLBACK_SECONDS)
    expect(sent[1]?.resolutionId).toBe(body.resolutionId)
    expect(sent[1]?.delaySeconds).toBeUndefined()
    sqlite.close()
  })

  it('hands the build to the Worker waitUntil and settles it when every send fails', async () => {
    const postResolutions = (await import(
      '../../layers/artifact-delivery/server/api/v1/resolutions/index.post',
    )).default
    const sqlite = createSqliteD1(MIGRATIONS)
    const awaited: Array<Promise<unknown>> = []
    const app = createApp()
    app.use(eventHandler((event) => {
      ;(event.context as { cloudflare?: object }).cloudflare = {
        context: { waitUntil: (promise: Promise<unknown>) => awaited.push(promise) },
      }
      event.context.platform = {
        db: sqlite.db,
        env: {
          ARTIFACT_BUILD_QUEUE: {
            send: async () => {
              throw new Error('the send must only be awaited, not resolved here')
            },
          },
          ARTIFACT_TRUSTED_ROOT_JSON: trustedRootConfig(),
        },
      } as never
    }))
    app.use(postResolutions)
    const handle = toWebHandler(app)

    const response = await handle(new Request('http://localhost/api/v1/resolutions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'post-route-waituntil-key1' },
      body: JSON.stringify({ source: { provider: 'github', owner: 'skilld-dev', repository: 'skills', selector: { type: 'path', path: 'skills/demo' } } }),
    }))

    expect(response.status).toBe(202)
    expect(awaited).toHaveLength(1)
    // Let the scheduled build and its failure settlement finish before the database closes.
    await Promise.allSettled(awaited)
    const body = await response.json()
    const settled = await getResolution(sqlite.db, body.resolutionId)
    expect(presentResolution(settled!)).toMatchObject({
      state: 'failed',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    })
    sqlite.close()
  })
})

/**
 * A trusted root config that parses. The scheduled build only reaches its
 * first D1 read, where the missing database throws, so nothing verifies
 * signatures.
 */
function trustedRootConfig(): string {
  const statement = {
    version: 1,
    rootKeyId: 'skilld-root-2026',
    keyId: 'skilld-production-2026-08',
    algorithm: 'Ed25519',
    publicKey: 'B'.repeat(43),
    notBefore: '2026-08-20T00:00:00.000Z',
    notAfter: '2026-11-20T00:00:00.000Z',
    status: 'active',
  } as const
  return JSON.stringify({
    version: 1,
    rootKeyId: statement.rootKeyId,
    rootPublicKey: 'A'.repeat(43),
    keys: [{
      keyId: statement.keyId,
      algorithm: statement.algorithm,
      publicKey: statement.publicKey,
      notBefore: statement.notBefore,
      notAfter: statement.notAfter,
      status: statement.status,
      statement: bytesToBase64Url(new TextEncoder().encode(JSON.stringify(statement))),
      rootSignature: 'C'.repeat(86),
    }],
  })
}
