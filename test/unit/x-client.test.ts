// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createXClient, X_LOOKUP_BATCH_SIZE } from '../../shared/server/x-client'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function clientReturning(body: unknown, init: ResponseInit = {}) {
  const calls: string[] = []
  const client = createXClient({
    bearerToken: 'test-token',
    allowNetwork: true,
    fetchImpl: async (input) => {
      calls.push(String(input))
      return jsonResponse(body, init)
    },
  })
  return { client, calls }
}

const A_POST = {
  id: '2087569590268391897',
  text: 'a skill worth installing',
  author_id: '820679805259550720',
  created_at: '2026-08-12T15:59:10.000Z',
  public_metrics: {
    like_count: 2218,
    retweet_count: 149,
    reply_count: 32,
    quote_count: 26,
    bookmark_count: 4649,
    impression_count: 237528,
  },
}

const AN_AUTHOR = {
  id: '820679805259550720',
  username: 'dexhorthy',
  name: 'dex',
  public_metrics: { followers_count: 30747 },
}

describe('createXClient search', () => {
  it('returns parsed posts joined to their author', async () => {
    const { client } = clientReturning({
      data: [A_POST],
      includes: { users: [AN_AUTHOR] },
      meta: { newest_id: A_POST.id, result_count: 1 },
    })

    const result = await client.searchRecent({ query: 'agent skills', sinceId: null })
    expect(result._tag).toBe('ok')
    if (result._tag !== 'ok')
      return

    const [post] = result.value.posts
    expect(post?.authorHandle).toBe('dexhorthy')
    expect(post?.authorFollowers).toBe(30747)
    expect(post?.metrics.bookmarkCount).toBe(4649)
    expect(post?.metrics.favouriteCount).toBe(2218)
    expect(result.value.newestId).toBe(A_POST.id)
  })

  it('sends the cursor so each post is only ever paid for once', async () => {
    const { client, calls } = clientReturning({ data: [], meta: { result_count: 0 } })
    await client.searchRecent({ query: 'agent skills', sinceId: '123' })
    expect(calls[0]).toContain('since_id=123')
  })

  it('omits the cursor on a cold start', async () => {
    const { client, calls } = clientReturning({ data: [], meta: { result_count: 0 } })
    await client.searchRecent({ query: 'agent skills', sinceId: null })
    expect(calls[0]).not.toContain('since_id')
  })

  it('prefers the long-form body, where a thread lists its repos', async () => {
    const { client } = clientReturning({
      data: [{
        ...A_POST,
        text: 'truncated at 280…',
        note_tweet: { text: 'the full thread naming github.com/a/b and more' },
      }],
      includes: { users: [AN_AUTHOR] },
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag === 'ok' && result.value.posts[0]?.text)
      .toBe('the full thread naming github.com/a/b and more')
  })

  it('collects urls from both the post and its long-form body', async () => {
    const { client } = clientReturning({
      data: [{
        ...A_POST,
        entities: { urls: [{ expanded_url: 'https://github.com/a/one' }] },
        note_tweet: { entities: { urls: [{ expanded_url: 'https://github.com/b/two' }] } },
      }],
      includes: { users: [AN_AUTHOR] },
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag === 'ok' && result.value.posts[0]?.urls)
      .toEqual(['https://github.com/a/one', 'https://github.com/b/two'])
  })

  it('follows the unwound destination rather than the shortener target', async () => {
    const { client } = clientReturning({
      data: [{
        ...A_POST,
        entities: {
          urls: [{
            expanded_url: 'https://t.co/abc',
            unwound_url: 'https://github.com/real/destination',
          }],
        },
      }],
      includes: { users: [AN_AUTHOR] },
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag === 'ok' && result.value.posts[0]?.urls)
      .toEqual(['https://github.com/real/destination'])
  })

  it('drops a post with no author but still charges it against the read count', async () => {
    const { client } = clientReturning({
      data: [{ id: '1', text: 'orphan', created_at: '2026-08-12T15:59:10.000Z' }],
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag === 'ok' && result.value.posts).toHaveLength(0)
    expect(result._tag === 'ok' && result.value.postsRead).toBe(1)
  })
})

describe('createXClient failures', () => {
  it('classifies exhausted X credits separately from rate limits', async () => {
    const client = createXClient({
      bearerToken: 't',
      allowNetwork: true,
      fetchImpl: async () => jsonResponse({
        title: 'Payment Required',
        detail: 'Credits depleted',
        type: 'https://api.x.com/2/problems/credits-depleted',
      }, { status: 402 }),
    })

    expect(await client.searchRecent({ query: 'q', sinceId: null }))
      .toEqual({ _tag: 'err', error: { _tag: 'credits-depleted' } })
  })

  it('reports a missing token instead of calling the API', async () => {
    let called = false
    const client = createXClient({
      bearerToken: undefined,
      fetchImpl: async () => {
        called = true
        return jsonResponse({})
      },
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result).toEqual({ _tag: 'err', error: { _tag: 'not-configured' } })
    expect(called).toBe(false)
  })

  it('separates an ordinary rate limit from cap exhaustion', async () => {
    const rateLimited = createXClient({
      bearerToken: 't',
      fetchImpl: async () => new Response('Too Many Requests', {
        status: 429,
        headers: { 'x-rate-limit-reset': '1786592822' },
      }),
    })
    const result = await rateLimited.searchRecent({ query: 'q', sinceId: null })
    expect(result).toEqual({ _tag: 'err', error: { _tag: 'rate-limited', resetAt: 1786592822 } })
  })

  it('recognises cap exhaustion, which must not be retried in-run', async () => {
    const capped = createXClient({
      bearerToken: 't',
      fetchImpl: async () => new Response('UsageCapExceeded: monthly product cap', { status: 429 }),
    })
    const result = await capped.searchRecent({ query: 'q', sinceId: null })
    expect(result).toEqual({ _tag: 'err', error: { _tag: 'cap-exceeded' } })
  })

  it('recognises a reached spend cap without blaming the token', async () => {
    const capped = createXClient({
      bearerToken: 'active',
      fetchImpl: async () => jsonResponse({
        title: 'Forbidden',
        detail: 'Your monthly spend cap has been reached.',
        type: 'https://api.x.com/2/problems/spend-cap-reached',
      }, { status: 403 }),
    })
    const result = await capped.searchRecent({ query: 'q', sinceId: null })
    expect(result).toEqual({ _tag: 'err', error: { _tag: 'cap-exceeded' } })
  })

  it('reports a rejected token', async () => {
    const client = createXClient({
      bearerToken: 'bad',
      fetchImpl: async () => new Response('Unauthorized', { status: 401 }),
    })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result).toEqual({ _tag: 'err', error: { _tag: 'unauthorized' } })
  })

  it('reports a malformed payload rather than yielding empty results', async () => {
    const { client } = clientReturning({ data: 'not an array' })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag === 'err' && result.error._tag).toBe('malformed-response')
  })
})

describe('createXClient local guard', () => {
  it('refuses to spend real budget when network calls are disallowed', async () => {
    // `.dev.vars` symlinks to `.env`, so a dev server holds a working token and
    // nothing else stops a task run from billing the account. One session spent
    // 302 reads before this guard existed.
    let called = false
    const client = createXClient({
      bearerToken: 'real-token',
      allowNetwork: false,
      fetchImpl: async () => {
        called = true
        return jsonResponse({})
      },
    })

    expect(await client.searchRecent({ query: 'q', sinceId: null }))
      .toEqual({ _tag: 'err', error: { _tag: 'local-blocked' } })
    expect(await client.lookupPosts(['1']))
      .toEqual({ _tag: 'err', error: { _tag: 'local-blocked' } })
    expect(await client.usage())
      .toEqual({ _tag: 'err', error: { _tag: 'local-blocked' } })
    expect(called).toBe(false)
  })

  it('reports a missing token ahead of the local guard', async () => {
    // Ordering matters for the operator message: an unconfigured environment
    // is a different problem from a deliberately blocked one.
    const client = createXClient({ bearerToken: undefined, allowNetwork: false })
    expect(await client.searchRecent({ query: 'q', sinceId: null }))
      .toEqual({ _tag: 'err', error: { _tag: 'not-configured' } })
  })

  it('allows calls when network access is granted', async () => {
    const { client } = clientReturning({ data: [], meta: { result_count: 0 } })
    const result = await client.searchRecent({ query: 'q', sinceId: null })
    expect(result._tag).toBe('ok')
  })
})

describe('createXClient lookup', () => {
  it('spends nothing when there is nothing to refresh', async () => {
    let called = false
    const client = createXClient({
      bearerToken: 't',
      fetchImpl: async () => {
        called = true
        return jsonResponse({})
      },
    })
    const result = await client.lookupPosts([])
    expect(result._tag === 'ok' && result.value.postsRead).toBe(0)
    expect(called).toBe(false)
  })

  it('refuses a batch larger than the API accepts', async () => {
    const { client } = clientReturning({ data: [] })
    const ids = Array.from({ length: X_LOOKUP_BATCH_SIZE + 1 }, (_, i) => String(i))
    const result = await client.lookupPosts(ids)
    expect(result._tag === 'err' && result.error._tag).toBe('malformed-response')
  })
})

describe('createXClient usage', () => {
  it('reads cap consumption as numbers, which the API sends as strings', async () => {
    const { client } = clientReturning({
      data: { cap_reset_day: 8, project_cap: '2000000', project_usage: '155' },
    })
    const result = await client.usage()
    expect(result).toEqual({ _tag: 'ok', value: { used: 155, cap: 2000000, resetDay: 8 } })
  })
})
