import type { GithubCredentialReport } from '../../shared/server/github-app-credential'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRepo,
  getRepoSummariesBatch,
  getRepoSummary,
  resolveGithubBindings,
} from '../../layers/registry/server/utils/github-client'
import { githubRateLimited } from '../../layers/registry/server/utils/github-rate-limited'
import { createInstallationTokenCache } from '../../shared/server/github-app-credential'

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

describe('registry GitHub reads with the read App', () => {
  it('reads with the installation token, not GITHUB_TOKEN', async () => {
    const github = await stubGithub({})
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(repo.status).toBe(200)
    expect(github.mints).toBe(1)
    expect(github.reads).toEqual(['Bearer ghs_app'])
  })

  it('repeats a read GitHub denied the App with GITHUB_TOKEN, and reports it', async () => {
    const github = await stubGithub({ deniesApp: true })
    const reports: GithubCredentialReport[] = []
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime(reports))

    const repo = await getRepo('neondatabase', 'agent-skills', bindings)

    expect(repo.status).toBe(200)
    expect(github.reads).toEqual(['Bearer ghs_app', 'Bearer site'])
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

    const repo = await getRepo('neondatabase', 'agent-skills', bindings)

    expect(github.reads).toEqual(['Bearer ghs_app'])
    expect(repo).toMatchObject({ status: 403, denied: true, data: null })
    // The sync pauses every repository for a spent quota. A denial names one.
    expect(githubRateLimited(repo)).toBe(false)
    expect(reports).toEqual([{
      outcome: 'app-denied',
      reason: 'GitHub denied the read App for /repos/neondatabase/agent-skills',
      fallback: 'none',
    }])
  })

  it('keeps a secondary rate limit a rate limit, with no second read', async () => {
    const github = await stubGithub({ secondaryLimit: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const repo = await getRepo('nuxt', 'ui', bindings)

    expect(github.reads).toEqual(['Bearer ghs_app'])
    expect(githubRateLimited(repo)).toBe(true)
  })

  it('repeats a GraphQL summary GitHub answered FORBIDDEN with GITHUB_TOKEN', async () => {
    const github = await stubGithub({ deniesApp: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const summary = await getRepoSummary('neondatabase', 'agent-skills', bindings)

    expect(summary.status).toBe(200)
    expect(github.reads).toEqual(['Bearer ghs_app', 'Bearer site'])
  })

  it('leaves a FORBIDDEN alias to the per-repository sync and keeps the rest of the batch', async () => {
    const github = await stubGithub({ deniesApp: true })
    const bindings = resolveGithubBindings(await appEnv({ GITHUB_TOKEN: 'site' }), runtime())

    const batch = await getRepoSummariesBatch([
      { owner: 'nuxt', repo: 'ui' },
      { owner: 'neondatabase', repo: 'agent-skills' },
    ], bindings)

    expect(batch).toMatchObject({ _tag: 'read', summaries: [{ meta: { full_name: 'nuxt/ui' } }, null] })
    expect(github.reads).toEqual(['Bearer ghs_app'])
  })

  it('reads with GITHUB_TOKEN when no App secret is set, as in local development', async () => {
    const github = await stubGithub({})
    const bindings = resolveGithubBindings({ GITHUB_TOKEN: 'local' }, runtime())

    await getRepo('nuxt', 'ui', bindings)

    expect(github.mints).toBe(0)
    expect(github.reads).toEqual(['Bearer local'])
  })
})

function runtime(reports: GithubCredentialReport[] = []) {
  return { tokenCache: createInstallationTokenCache(), now: () => NOW, report: (event: GithubCredentialReport) => reports.push(event) }
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

/**
 * GitHub as the App and a personal token see it. `neondatabase` denies the
 * App on every read, as it did on 2026-10-06, and answers a personal token.
 */
async function stubGithub(options: { deniesApp?: boolean, secondaryLimit?: boolean }) {
  const state = { mints: 0, reads: [] as Array<string | null> }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.endsWith(`/app/installations/${INSTALLATION_ID}/access_tokens`)) {
      state.mints++
      return Response.json({ token: 'ghs_app', expires_at: new Date((NOW + 3600) * 1000).toISOString() }, { status: 201 })
    }
    const authorization = headers.get('authorization')
    state.reads.push(authorization)
    const asApp = authorization === 'Bearer ghs_app'
    if (options.secondaryLimit)
      return Response.json({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }, { status: 403 })
    if (url.endsWith('/graphql')) {
      const body = JSON.parse(String(init?.body)) as { variables: Record<string, string> }
      const owners = Object.entries(body.variables).filter(([key]) => key === 'owner' || /^o\d+$/.test(key))
      const denied = options.deniesApp && asApp && owners.some(([, owner]) => owner === 'neondatabase')
      const repository = (owner: string, name: string) => ({
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
        defaultBranchRef: { name: 'main', target: { oid: 'a'.repeat(40), tree: { oid: 'b'.repeat(40) } } },
      })
      if ('owner' in body.variables) {
        return denied
          ? Response.json({ data: { repository: null }, errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }] })
          : Response.json({ data: { repository: repository(body.variables.owner!, body.variables.repo!) } })
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
      return Response.json(errors.length ? { data, errors } : { data })
    }
    if (options.deniesApp && asApp && url.includes('/neondatabase/'))
      return Response.json({ message: 'Resource not accessible by integration' }, { status: 403, headers: { 'x-ratelimit-remaining': '4990' } })
    return Response.json({ name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' }, default_branch: 'main' }, { status: 200 })
  }))
  return state
}
