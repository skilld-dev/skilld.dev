// @vitest-environment node
import type { GithubBindings } from '#layers/registry/server/utils/github-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubRepoSizer } from '../../shared/server/discovery-size-guard'

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

function summaryResponse() {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          databaseId: 1,
          name: 'repo',
          nameWithOwner: 'owner/repo',
          url: 'https://github.com/owner/repo',
          owner: { login: 'owner' },
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
    expect(first).toEqual({ _tag: 'sized', skillCount: 2 })

    // Warm. This is the call that used to report `tree-304` forever.
    const second = await size({ owner: 'owner', repo: 'repo' })
    expect(second).toEqual({ _tag: 'sized', skillCount: 2 })
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
})
