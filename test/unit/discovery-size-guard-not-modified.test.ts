// @vitest-environment node
import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import type { OwnerKind } from '../../shared/server/discovery-size-guard'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubRepoSizer, skillLimitFor } from '../../shared/server/discovery-size-guard'

/**
 * A warm ETag cache used to stall discovery permanently.
 *
 * `ghRequest` sends `If-None-Match` once it has cached a response, and on a
 * 304 it returns the cached body with `status: 304`. The sizer asked
 * `status !== 200` and threw that body away, so it reported `unknown`, and
 * `submitDiscoveredRepos` correctly parked an unmeasurable repo as pending.
 *
 * The second call is the one that matters. A repo sizes fine the first time,
 * gets cached, and from then on returns 304 forever, so it can never be
 * submitted again. Production sat in exactly that state: 25 of 25 attempted
 * rows reported `tree-304`, including five root-skill repos that had been
 * waiting sixteen hours.
 *
 * A cache hit is a successful read. Only the absence of a body is a failure.
 */

const TREE = {
  sha: 'tree-sha',
  truncated: false,
  tree: [
    { path: 'SKILL.md', type: 'blob', sha: 'a' },
    { path: 'skills/one/SKILL.md', type: 'blob', sha: 'b' },
    { path: 'README.md', type: 'blob', sha: 'c' },
  ],
}

function summaryResponse(typename: string = 'User') {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          name: 'repo',
          nameWithOwner: 'owner/repo',
          url: 'https://github.com/owner/repo',
          owner: { login: 'owner', __typename: typename },
          description: null,
          stargazerCount: 1,
          forkCount: 0,
          pushedAt: '2026-08-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
          isArchived: false,
          isFork: false,
          defaultBranchRef: { name: 'main', target: { oid: 'commit', tree: { oid: 'tree-sha' } } },
        },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/** KV double that actually persists, so the second call sends If-None-Match. */
function kvCache() {
  const store = new Map<string, string>()
  return {
    get: async (key: string, _type?: string) => {
      const raw = store.get(key)
      return raw ? JSON.parse(raw) : null
    },
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
  } as unknown as KVNamespace
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('repo sizer against a warm ETag cache', () => {
  it('sizes a repo whose tree comes back 304 Not Modified', async () => {
    const bindings: GithubBindings = { GITHUB_TOKEN: 't', KV_CACHE: kvCache() }

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('graphql'))
        return summaryResponse()
      // The tree endpoint. Answer 200 with an ETag when asked cold, and 304
      // once the caller proves it already holds that version.
      const sentEtag = new Headers(init?.headers).get('If-None-Match')
      if (sentEtag === 'W/"abc"')
        return new Response(null, { status: 304 })
      return new Response(JSON.stringify(TREE), {
        status: 200,
        headers: { 'content-type': 'application/json', 'etag': 'W/"abc"' },
      })
    }))

    const size = createGithubRepoSizer(bindings)

    // Cold. Populates the cache.
    const first = await size({ owner: 'owner', repo: 'repo' })
    expect(first).toEqual({ _tag: 'sized', skillCount: 2, ownerKind: 'user' })

    // Warm. This is the call that used to report `tree-304` forever.
    const second = await size({ owner: 'owner', repo: 'repo' })
    expect(second).toEqual({ _tag: 'sized', skillCount: 2, ownerKind: 'user' })
  })

  it('still reports unknown when a failure carries no body', async () => {
    const bindings: GithubBindings = { GITHUB_TOKEN: 't', KV_CACHE: kvCache() }

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('graphql'))
        return summaryResponse()
      return new Response('rate limited', { status: 403 })
    }))

    const size = createGithubRepoSizer(bindings)
    // Failing closed is the whole point of the guard, so this must not soften
    // into "small enough" while the 304 case is being let through.
    expect(await size({ owner: 'owner', repo: 'repo' })).toEqual({
      _tag: 'unknown',
      reason: 'tree-403',
    })
  })

  it('still reports gone for a deleted repository', async () => {
    const bindings: GithubBindings = { GITHUB_TOKEN: 't', KV_CACHE: kvCache() }

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ errors: [{ type: 'NOT_FOUND', message: 'missing' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))

    const size = createGithubRepoSizer(bindings)
    expect(await size({ owner: 'owner', repo: 'repo' })).toEqual({ _tag: 'gone' })
  })

  it('reads the owner type from the summary GitHub already answered', async () => {
    // No second request: the owner type decides which limit applies, and the
    // summary query already selects the owner.
    const bindings: GithubBindings = { GITHUB_TOKEN: 't', KV_CACHE: kvCache() }
    const fetchSpy = vi.fn(async (url: string | URL) => {
      if (String(url).includes('graphql'))
        return summaryResponse('Organization')
      return new Response(JSON.stringify(TREE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const size = createGithubRepoSizer(bindings)

    expect(await size({ owner: 'owner', repo: 'repo' }))
      .toEqual({ _tag: 'sized', skillCount: 2, ownerKind: 'org' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('treats an owner type GitHub has not named as a person', async () => {
    // Fails to the stricter limit, so a new account type cannot widen the gate
    // by being unrecognised.
    const bindings: GithubBindings = { GITHUB_TOKEN: 't', KV_CACHE: kvCache() }
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('graphql'))
        return summaryResponse('EnterpriseAccountSomething')
      return new Response(JSON.stringify(TREE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))

    const size = createGithubRepoSizer(bindings)

    expect(await size({ owner: 'owner', repo: 'repo' }))
      .toEqual({ _tag: 'sized', skillCount: 2, ownerKind: 'user' })
  })
})

describe('skillLimitFor', () => {
  it('gives an organization more headroom than a person', () => {
    // A person publishing 150 skills is republishing someone else's work. A
    // company publishing 150 is documenting its own product surface.
    expect(skillLimitFor('user')).toBe(100)
    expect(skillLimitFor('org')).toBe(250)
  })

  it('falls to the stricter limit for an owner kind it does not know', () => {
    expect(skillLimitFor('something-new' as OwnerKind)).toBe(skillLimitFor('user'))
  })
})
