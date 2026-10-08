import type { GithubCredentialReport } from '../../shared/server/github-app-credential'
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRepo,
  getRepoSummariesBatch,
  getRepoSummary,
  resolveGithubBindings,
} from '../../layers/registry/server/utils/github-client'
import { githubRateLimited } from '../../layers/registry/server/utils/github-rate-limited'
import { createInstallationTokenCache, INSTALLATION_TOKEN_RENEW_SECONDS } from '../../shared/server/github-app-credential'

// Every Worker GitHub read used `GITHUB_TOKEN`, a personal token whose quota
// the owner's own tools and CI runners also spend. The read App's
// installation has a bucket of its own. `GITHUB_TOKEN` is now read only where
// GitHub denies the App, such as an organization that restricts Apps.
const APP_ID = '5212127'
const INSTALLATION_ID = '168540695'
const NOW = 1_791_300_000

afterEach(() => {
  vi.unstubAllGlobals()
})

const readRepo = (bindings: ReturnType<typeof resolveGithubBindings>) => getRepo('neondatabase', 'agent-skills', bindings)
const readSummary = (bindings: ReturnType<typeof resolveGithubBindings>) => getRepoSummary('neondatabase', 'agent-skills', bindings)

describe('registry GitHub reads with the read App', () => {
  it('reads with the installation token, not GITHUB_TOKEN', async () => {
    const github = await stubGithub({})
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(repo.status).toBe(200)
    expect(github.mints).toBe(1)
    expect(github.reads).toEqual(['Bearer ghs_app_1'])
  })

  it('repeats a read GitHub denied the App with GITHUB_TOKEN, and reports it', async () => {
    const github = await stubGithub({ deniesApp: true })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports))

    const repo = await readRepo(bindings)

    expect(repo.status).toBe(200)
    expect(github.reads).toEqual(['Bearer ghs_app_1', 'Bearer site'])
    expect(reports).toEqual([{
      outcome: 'app-denied',
      reason: 'GitHub denied the read App for /repos/neondatabase/agent-skills',
      fallback: 'GITHUB_TOKEN',
    }])
  })

  it('answers a denied read as denied, not rate limited, with no GITHUB_TOKEN', async () => {
    const github = await stubGithub({ deniesApp: true })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({}), runtime(reports))

    const repo = await readRepo(bindings)

    expect(github.reads).toEqual(['Bearer ghs_app_1'])
    expect(repo).toMatchObject({ status: 403, denied: true, data: null })
    // The sync pauses every repository for a spent quota. A denial names one.
    expect(githubRateLimited(repo)).toBe(false)
    expect(reports).toEqual([{
      outcome: 'app-denied',
      reason: 'GitHub denied the read App for /repos/neondatabase/agent-skills',
      fallback: 'none',
    }])
  })

  // GITHUB_TOKEN is a personal token. A limit on the App is no denial, so it
  // never reaches that token, on REST or on GraphQL.
  it.each([
    ['a secondary limit', 'REST', readRepo, 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.'],
    ['a secondary limit', 'GraphQL', readSummary, 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.'],
    ['the abuse detection limit', 'REST', readRepo, 'You have triggered an abuse detection mechanism. Please wait a few minutes before you try again.'],
    ['the abuse detection limit', 'GraphQL', readSummary, 'You have triggered an abuse detection mechanism. Please wait a few minutes before you try again.'],
  ] as const)('keeps %s on %s a rate limit, with no second read', async (_, __, read, message) => {
    const github = await stubGithub({ limitMessage: message })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const outcome = await read(bindings)

    expect(github.reads).toEqual(['Bearer ghs_app_1'])
    expect(githubRateLimited(outcome)).toBe(true)
  })

  it('never repeats a GraphQL RATE_LIMITED answer with GITHUB_TOKEN', async () => {
    const github = await stubGithub({ graphqlRateLimited: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const summary = await readSummary(bindings)

    expect(github.reads).toEqual(['Bearer ghs_app_1'])
    expect(summary.data).toBeNull()
  })

  it('repeats a GraphQL summary GitHub answered FORBIDDEN with GITHUB_TOKEN', async () => {
    const github = await stubGithub({ deniesApp: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const summary = await readSummary(bindings)

    expect(summary.status).toBe(200)
    expect(github.reads).toEqual(['Bearer ghs_app_1', 'Bearer site'])
  })

  it('leaves a FORBIDDEN alias to the per-repository sync and keeps the rest of the batch', async () => {
    const github = await stubGithub({ deniesApp: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const batch = await getRepoSummariesBatch([
      { owner: 'nuxt', repo: 'ui' },
      { owner: 'neondatabase', repo: 'agent-skills' },
    ], bindings)

    expect(batch).toMatchObject({ _tag: 'read', summaries: [{ meta: { full_name: 'nuxt/ui' } }, null] })
    expect(github.reads).toEqual(['Bearer ghs_app_1'])
  })

  it('never repeats a whole summary batch GitHub answered 403 with GITHUB_TOKEN', async () => {
    const github = await stubGithub({ graphqlDeniesApp: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const batch = await getRepoSummariesBatch([{ owner: 'nuxt', repo: 'ui' }], bindings)

    expect(batch).toMatchObject({ _tag: 'failed', status: 403 })
    expect(github.reads).toEqual(['Bearer ghs_app_1'])
  })

  it('reads with GITHUB_TOKEN when no App secret is set, as in local development', async () => {
    const github = await stubGithub({})
    const bindings = resolveGithubBindings({ GITHUB_TOKEN: 'local' }, runtime())

    await getRepo('nuxt', 'ui', bindings)

    expect(github.mints).toBe(0)
    expect(github.reads).toEqual(['Bearer local'])
  })
})

// GITHUB_TOKEN's quota belongs to its owner. A denied Repository that it
// cannot read either is a fact about that Repository, so the sync records
// one failure and keeps going on the App's quota.
describe('a read GITHUB_TOKEN repeats for a Repository that denies the App', () => {
  it.each([
    ['a spent quota', 'REST', readRepo],
    ['a spent quota', 'GraphQL', readSummary],
    ['a rejected token', 'REST', readRepo],
    ['a rejected token', 'GraphQL', readSummary],
  ] as const)('answers %s on %s as denied, not rate limited or unauthorized', async (answer, _, read) => {
    await stubGithub({ deniesApp: true, fallbackAnswers: answer === 'a spent quota' ? 'rate-limited' : 'unauthorized' })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const outcome = await read(bindings)

    expect(outcome).toMatchObject({ status: 403, denied: true, data: null })
    expect(githubRateLimited(outcome)).toBe(false)
  })

  it.each([
    ['REST', readRepo],
    ['GraphQL', readSummary],
  ] as const)('reports the App quota, not GITHUB_TOKEN\'s, on %s', async (_, read) => {
    await stubGithub({ deniesApp: true, fallbackAnswers: 'low-quota' })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const outcome = await read(bindings)

    expect(outcome.status).toBe(200)
    expect(outcome.rateLimit?.remaining).toBe(4990)
  })
})

// An installation token can stop working before the expiry GitHub gave it:
// the App key rotated, or the token was revoked. One new token fixes every
// later read, so GITHUB_TOKEN is not spent until that token fails too.
describe('a read GitHub answered 401 for the cached installation token', () => {
  it.each([
    ['REST', readRepo],
    ['GraphQL', readSummary],
  ] as const)('mints one new token and repeats the %s read with it', async (_, read) => {
    const github = await stubGithub({ rejects: ['ghs_app_1'] })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports))

    const outcome = await read(bindings)

    expect(outcome.status).toBe(200)
    expect(github.mints).toBe(2)
    expect(github.reads).toEqual(['Bearer ghs_app_1', 'Bearer ghs_app_2'])
    expect(reports).toEqual([])
  })

  it('mints once for reads GitHub rejected together', async () => {
    const rejects: string[] = []
    const github = await stubGithub({ rejects })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())
    await getRepo('nuxt', 'ui', bindings)
    rejects.push('ghs_app_1')
    github.reads.length = 0

    const repos = await Promise.all([getRepo('nuxt', 'ui', bindings), getRepo('nuxt', 'nuxt', bindings), getRepo('nuxt', 'image', bindings)])

    expect(repos.map(repo => repo.status)).toEqual([200, 200, 200])
    expect(github.mints).toBe(2)
    expect(github.reads.filter(read => read === 'Bearer ghs_app_1')).toHaveLength(3)
    expect(github.reads).not.toContain('Bearer site')
  })

  it('reads with GITHUB_TOKEN, and reports it, when GitHub rejects the new token too', async () => {
    const github = await stubGithub({ rejects: ['ghs_app_1', 'ghs_app_2'] })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports))

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(repo.status).toBe(200)
    expect(github.reads).toEqual(['Bearer ghs_app_1', 'Bearer ghs_app_2', 'Bearer site'])
    expect(reports).toEqual([{
      outcome: 'app-token-rejected',
      reason: 'GitHub rejected a new read App installation token for /repos/nuxt/ui',
      fallback: 'GITHUB_TOKEN',
    }])
  })

  it('answers 401 when GitHub rejects the new token and no GITHUB_TOKEN is set', async () => {
    await stubGithub({ rejects: ['ghs_app_1', 'ghs_app_2'] })
    const bindings = resolveGithubBindings(await appEnv({}), runtime())

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(repo).toMatchObject({ status: 401, data: null })
  })
})

// A mint GitHub never answered held a page read for the mint's own 15 second
// limit, not the page's 4 second read limit.
describe('a mint for a read with a deadline', () => {
  it('ends at the read deadline, not at the mint limit', async () => {
    const github = await stubGithub({ mintPlan: ['hang'] })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())
    const started = Date.now()

    await expect(getRepo('nuxt', 'ui', bindings, { timeoutMs: 50 })).rejects.toMatchObject({ name: 'TimeoutError' })

    expect(Date.now() - started).toBeLessThan(2_000)
    expect(github.mintSignals[0]?.aborted).toBe(true)
    expect(github.reads).toEqual([])
  })

  // A page can start a read with little of its budget left. That says
  // nothing about the App, so the next read mints again.
  it('leaves the next read on the App when only the deadline ended the mint', async () => {
    const github = await stubGithub({ mintPlan: ['hang'] })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports))
    await expect(getRepo('nuxt', 'ui', bindings, { timeoutMs: 50 })).rejects.toMatchObject({ name: 'TimeoutError' })

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(repo.status).toBe(200)
    expect(github.mints).toBe(2)
    expect(github.reads).toEqual(['Bearer ghs_app_2'])
    expect(reports).toEqual([])
  })

  it('holds a read with no deadline to no page deadline', async () => {
    const github = await stubGithub({ mintPlan: ['hang'] })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const [page, sync] = await Promise.allSettled([
      getRepo('nuxt', 'ui', bindings, { timeoutMs: 50 }),
      getRepo('nuxt', 'nuxt', bindings),
    ])

    expect(page).toMatchObject({ status: 'rejected', reason: { name: 'TimeoutError' } })
    expect(sync).toMatchObject({ status: 'fulfilled', value: { status: 200 } })
    expect(github.mints).toBe(2)
    expect(github.reads).toEqual(['Bearer ghs_app_2'])
  })
})

// Every read tried a new mint after one failed, and reported it. A broken App
// cost one mint and one event per read, and the sync paced on GITHUB_TOKEN.
describe('a failed mint', () => {
  it('stands for about a minute, then the next read mints again', async () => {
    const github = await stubGithub({ mintPlan: ['fail'] })
    const reports: GithubCredentialReport[] = []
    const clock = { now: NOW }
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports, clock))

    await getRepo('nuxt', 'ui', bindings)
    clock.now = NOW + 54
    await getRepo('nuxt', 'ui', bindings)

    expect(github.mints).toBe(1)
    expect(github.reads).toEqual(['Bearer site', 'Bearer site'])
    expect(reports).toEqual([{ outcome: 'app-token-unavailable', reason: 'GitHub App request returned 500', fallback: 'GITHUB_TOKEN' }])

    clock.now = NOW + 65
    await getRepo('nuxt', 'ui', bindings)

    expect(github.mints).toBe(2)
    expect(github.reads.at(-1)).toBe('Bearer ghs_app_2')
  })

  it('costs one report for requests that meet it together, and no mint after', async () => {
    const github = await stubGithub({ mintPlan: ['fail', 'fail', 'fail'] })
    const reports: GithubCredentialReport[] = []
    const isolate = runtime(reports)
    const env = await appEnv({ GITHUB_TOKEN: 'site' })
    // Each request resolves its own bindings over the one isolate cache.
    const read = (repo: string) => getRepo('nuxt', repo, resolveGithubBindings(env, isolate))

    await Promise.all([read('ui'), read('nuxt'), read('image')])
    await Promise.all([read('ui'), read('nuxt')])

    expect(github.mints).toBe(3)
    expect(github.reads).toEqual(Array.from({ length: 5 }).fill('Bearer site'))
    expect(reports).toHaveLength(1)
  })

  it('never stops the one new mint after GitHub answered 401 for a minted token', async () => {
    const rejects: string[] = []
    const mintPlan: MintAnswer[] = []
    let release = () => {}
    const until = new Promise<void>((resolve) => {
      release = resolve
    })
    const github = await stubGithub({ rejects, mintPlan, hold: { token: 'ghs_app_1', until } })
    const reports: GithubCredentialReport[] = []
    const clock = { now: NOW }
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports, clock))

    // This read holds the first token while the next mint fails.
    const held = getRepo('nuxt', 'ui', bindings)
    await vi.waitFor(() => expect(github.reads).toEqual(['Bearer ghs_app_1']))
    clock.now = NOW + 3600 - INSTALLATION_TOKEN_RENEW_SECONDS
    mintPlan.push('fail')
    await getRepo('nuxt', 'nuxt', bindings)
    expect(github.reads.at(-1)).toBe('Bearer site')

    rejects.push('ghs_app_1')
    release()
    const repo = await held

    expect(repo.status).toBe(200)
    expect(github.mints).toBe(3)
    expect(github.reads.at(-1)).toBe('Bearer ghs_app_3')
  })

  it('reports unusable App secrets once a window, not once a read', async () => {
    const github = await stubGithub({})
    const reports: GithubCredentialReport[] = []
    const clock = { now: NOW }
    const env = { ...(await appEnv({ GITHUB_TOKEN: 'site' })), SKILLD_READ_APP_ID: 'not-an-id' }
    const bindings = resolveGithubBindings(env, runtime(reports, clock))

    await getRepo('nuxt', 'ui', bindings)
    await getRepo('nuxt', 'nuxt', bindings)
    expect(reports).toHaveLength(1)

    clock.now = NOW + 65
    await getRepo('nuxt', 'ui', bindings)

    expect(github.mints).toBe(0)
    expect(reports).toHaveLength(2)
    expect(reports[1]).toEqual({ outcome: 'app-misconfigured', reason: 'SKILLD_READ_APP_ID is not a GitHub App ID', fallback: 'GITHUB_TOKEN' })
  })
})

// workerd ties a fetch to the request that made it. A request that awaited
// another request's mint could throw "Cannot perform I/O on behalf of a
// different request", or wait forever once that request ended. Requests share
// only a finished token.
describe('requests that find no token in the isolate', () => {
  it('each read with a token minted in their own I/O context', async () => {
    const github = await stubGithub({ mintPlan: ['held', 'held'] })
    const isolate = runtime()
    const env = await appEnv({ GITHUB_TOKEN: 'site' })
    const first = workerRequest('first')
    const second = workerRequest('second')

    const reads = Promise.all([
      first.run(() => getRepo('nuxt', 'ui', resolveGithubBindings(env, isolate))),
      second.run(() => getRepo('nuxt', 'nuxt', resolveGithubBindings(env, isolate))),
    ])
    await vi.waitFor(() => expect(github.mints).toBe(2))
    github.releaseMints()

    expect((await reads).map(repo => repo.status)).toEqual([200, 200])
    // Either request can sign its JWT first, so either can mint `ghs_app_1`.
    const mintedBy = new Map(github.mintsBy.map(([request, token]) => [`Bearer ${token}`, request]))
    const readWithMintOf = new Map(github.readsBy.map(([request, authorization]) => [request, mintedBy.get(authorization!)]))
    expect(readWithMintOf).toEqual(new Map([['first', 'first'], ['second', 'second']]))
  })

  it('leaves a request on the App when the request whose mint it met ends', async () => {
    const github = await stubGithub({ mintPlan: ['held'] })
    const reports: GithubCredentialReport[] = []
    const isolate = runtime(reports)
    const env = await appEnv({ GITHUB_TOKEN: 'site' })
    const first = workerRequest('first')
    const second = workerRequest('second')

    // The first request ends before GitHub answers its mint, so the answer
    // never arrives.
    void first.run(() => getRepo('nuxt', 'ui', resolveGithubBindings(env, isolate)))
    await vi.waitFor(() => expect(github.mints).toBe(1))
    const read = second.run(() => getRepo('nuxt', 'nuxt', resolveGithubBindings(env, isolate)))
    first.end()
    github.releaseMints()

    const repo = await within(read, 1_000)
    // The mint that never answered holds no later request either.
    const later = await within(workerRequest('third').run(() => getRepo('nuxt', 'image', resolveGithubBindings(env, isolate))), 1_000)

    expect([repo.status, later.status]).toEqual([200, 200])
    expect(github.mints).toBe(2)
    expect(github.readsBy).toEqual([['second', 'Bearer ghs_app_2'], ['third', 'Bearer ghs_app_2']])
    expect(reports).toEqual([])
  })
})

/**
 * One Worker request's I/O context. A fetch belongs to the request that made
 * it: once that request ends, its answer never arrives.
 */
interface IoContext {
  name: string
  ended: boolean
}

const ioContexts = new AsyncLocalStorage<IoContext>()

function workerRequest(name: string) {
  const context: IoContext = { name, ended: false }
  return {
    run: async <A>(work: () => Promise<A>): Promise<A> => await ioContexts.run(context, work),
    end: () => {
      context.ended = true
    },
  }
}

/** The promise's value, or a rejection if it takes longer than `ms`. */
async function within<A>(promise: Promise<A>, ms: number): Promise<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms)
  })
  return await Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

function runtime(reports: GithubCredentialReport[] = [], clock = { now: NOW }) {
  return { tokenCache: createInstallationTokenCache(), now: () => clock.now, report: (event: GithubCredentialReport) => reports.push(event) }
}

async function appEnv(tokens: { GITHUB_TOKEN?: string }) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer)
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`
  return {
    SKILLD_READ_APP_ID: APP_ID,
    SKILLD_READ_APP_INSTALLATION_ID: INSTALLATION_ID,
    SKILLD_READ_APP_PRIVATE_KEY_PKCS8: pem,
    ...tokens,
  }
}

interface StubOptions {
  /** `neondatabase` denies the App on every read, as it did on 2026-10-06. */
  deniesApp?: boolean
  /** Every read as the App answers 403 with this rate limit message. */
  limitMessage?: string
  /** Every GraphQL read as the App answers 200 with a RATE_LIMITED error. */
  graphqlRateLimited?: boolean
  /** Every GraphQL read as the App answers 403 with quota left. */
  graphqlDeniesApp?: boolean
  /** How GitHub answers the personal token. It reads everything by default. */
  fallbackAnswers?: 'rate-limited' | 'unauthorized' | 'low-quota'
  /** Installation tokens GitHub answers 401, as for a revoked token. */
  rejects?: string[]
  /** How GitHub answers each mint, in order. A mint past the end succeeds. */
  mintPlan?: MintAnswer[]
  /** The first read with this token waits for `until` before GitHub answers it. */
  hold?: { token: string, until: Promise<void> }
}

/**
 * `hang` answers nothing until the request is aborted. `fail` answers 500.
 * `held` answers a token once the test calls `releaseMints`.
 */
type MintAnswer = 'hang' | 'fail' | 'held'

/**
 * GitHub as the App and a personal token see it. Each mint answers a new
 * installation token: `ghs_app_1`, then `ghs_app_2`.
 */
async function stubGithub(options: StubOptions) {
  let releaseMints = () => {}
  const released = new Promise<void>((resolve) => {
    releaseMints = resolve
  })
  const state = {
    mints: 0,
    reads: [] as Array<string | null>,
    mintSignals: [] as Array<AbortSignal | null | undefined>,
    /** The I/O context that made each mint, with the token GitHub answered. */
    mintsBy: [] as Array<[string | undefined, string]>,
    /** The I/O context that made each read, with its authorization. */
    readsBy: [] as Array<[string | undefined, string | null]>,
    releaseMints: () => releaseMints(),
  }
  const hold = { pending: options.hold }
  const appQuota = { 'x-ratelimit-remaining': '4990', 'x-ratelimit-limit': '5000' }
  const answer = async (input: RequestInfo | URL, init: RequestInit | undefined, context: IoContext | undefined): Promise<Response> => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.endsWith(`/app/installations/${INSTALLATION_ID}/access_tokens`)) {
      const token = `ghs_app_${++state.mints}`
      state.mintSignals.push(init?.signal)
      state.mintsBy.push([context?.name, token])
      const plan = options.mintPlan?.shift()
      if (plan === 'fail')
        return new Response('{}', { status: 500 })
      if (plan === 'hang') {
        return await new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
        })
      }
      if (plan === 'held')
        await released
      return Response.json({ token, expires_at: new Date((NOW + 3600) * 1000).toISOString() }, { status: 201 })
    }
    const authorization = headers.get('authorization')
    state.reads.push(authorization)
    state.readsBy.push([context?.name, authorization])
    if (hold.pending && authorization === `Bearer ${hold.pending.token}`) {
      const until = hold.pending.until
      hold.pending = undefined
      await until
    }
    const asApp = authorization?.startsWith('Bearer ghs_app_') === true
    const graphql = url.endsWith('/graphql')
    if (asApp && options.rejects?.includes(authorization!.slice('Bearer '.length)))
      return Response.json({ message: 'Bad credentials' }, { status: 401 })
    if (asApp && options.limitMessage)
      return Response.json({ message: options.limitMessage }, { status: 403, headers: appQuota })
    if (asApp && graphql && options.graphqlDeniesApp)
      return Response.json({ message: 'Resource not accessible by integration' }, { status: 403, headers: appQuota })
    if (asApp && graphql && options.graphqlRateLimited)
      return Response.json({ data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for installation.' }] }, { headers: appQuota })
    if (!asApp && options.fallbackAnswers === 'unauthorized')
      return Response.json({ message: 'Bad credentials' }, { status: 401 })
    if (!asApp && options.fallbackAnswers === 'rate-limited') {
      return graphql
        ? Response.json({ data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user ID 5326365.' }] }, { headers: { 'x-ratelimit-remaining': '0' } })
        : Response.json({ message: 'API rate limit exceeded for user ID 5326365.' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
    }
    const quota = asApp ? appQuota : { 'x-ratelimit-remaining': options.fallbackAnswers === 'low-quota' ? '12' : '4000' }
    if (graphql) {
      const body = JSON.parse(String(init?.body)) as { variables: Record<string, string> }
      const owners = Object.entries(body.variables).filter(([key]) => key === 'owner' || /^o\d+$/.test(key))
      const denied = options.deniesApp && asApp && owners.some(([, owner]) => owner === 'neondatabase')
      const repository = (owner: string, name: string) => ({
        databaseId: owner.length * 1000 + name.length,
        name,
        nameWithOwner: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}`,
        owner: { login: owner },
        description: null,
        stargazerCount: 1,
        forkCount: 0,
        pushedAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        isArchived: false,
        isFork: false,
        isPrivate: false,
        defaultBranchRef: { name: 'main', target: { oid: 'a'.repeat(40), tree: { oid: 'b'.repeat(40) } } },
      })
      if ('owner' in body.variables) {
        return denied
          ? Response.json({ data: { repository: null }, errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }] }, { headers: quota })
          : Response.json({ data: { repository: repository(body.variables.owner!, body.variables.repo!) } }, { headers: quota })
      }
      const data: Record<string, unknown> = {}
      const errors: Array<{ type: string, path: string[] }> = []
      for (const [key, owner] of owners) {
        const alias = `r${key.slice(1)}`
        const name = body.variables[`n${key.slice(1)}`]!
        if (owner === 'neondatabase' && denied) {
          data[alias] = null
          errors.push({ type: 'FORBIDDEN', path: [alias] })
        }
        else {
          data[alias] = repository(owner, name)
        }
      }
      return Response.json(errors.length ? { data, errors } : { data }, { headers: quota })
    }
    if (options.deniesApp && asApp && url.includes('/neondatabase/'))
      return Response.json({ message: 'Resource not accessible by integration' }, { status: 403, headers: quota })
    return Response.json({ name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' }, default_branch: 'main' }, { status: 200, headers: quota })
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const context = ioContexts.getStore()
    const response = await answer(input, init, context)
    // workerd drops the answer to a fetch whose request has ended.
    return context?.ended ? await new Promise<never>(() => {}) : response
  }))
  return state
}
