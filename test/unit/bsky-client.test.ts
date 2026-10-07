import { describe, expect, it } from 'vitest'
import { createBskyClient, describeBskyError } from '../../shared/server/bsky-client'

const POSTED_AT = '2026-08-13T21:16:59.645Z'

function rawPost(overrides: Record<string, unknown> = {}) {
  return {
    uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
    cid: 'bafy',
    author: { did: 'did:plc:abc', handle: 'someone.bsky.social', displayName: 'Some One' },
    record: { text: 'a skill', createdAt: POSTED_AT, langs: ['en'] },
    likeCount: 7,
    repostCount: 2,
    replyCount: 1,
    quoteCount: 0,
    indexedAt: POSTED_AT,
    ...overrides,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

/** Records every request, replying with a scripted queue of responses. */
function stubFetch(responses: Array<() => Response>) {
  const urls: string[] = []
  const headers: Array<Record<string, string>> = []
  let call = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input))
    headers.push(Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)))
    const next = responses[call++]
    return next ? next() : jsonResponse({ posts: [] })
  }) as unknown as typeof fetch
  return { impl, urls, headers, callCount: () => call }
}

async function noSleep() {}

describe('createBskyClient searchPosts', () => {
  it('reads the public AppView when no app password is supplied', async () => {
    const { impl, urls, headers } = stubFetch([() => jsonResponse({ posts: [rawPost()] })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: '"SKILL.md"', since: POSTED_AT })

    expect(result._tag).toBe('ok')
    expect(urls[0]).toContain('https://api.bsky.app/xrpc/app.bsky.feed.searchPosts')
    expect(headers[0]).not.toHaveProperty('authorization')
    expect(client.isAuthenticated()).toBe(false)
  })

  it('parses metrics, author and timestamp off a post', async () => {
    const { impl } = stubFetch([() => jsonResponse({ posts: [rawPost()], cursor: 'c1' })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({
      _tag: 'ok',
      value: {
        cursor: 'c1',
        postsRead: 1,
        posts: [{
          uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
          authorDid: 'did:plc:abc',
          authorHandle: 'someone.bsky.social',
          lang: 'en',
          postedAt: Math.floor(new Date(POSTED_AT).getTime() / 1000),
          metrics: { likeCount: 7, repostCount: 2, replyCount: 1, quoteCount: 0 },
        }],
      },
    })
  })

  it('collects URLs from link facets, the embed card and bare text alike', async () => {
    const { impl } = stubFetch([() => jsonResponse({
      posts: [rawPost({
        record: {
          text: 'see https://github.com/a/one.',
          createdAt: POSTED_AT,
          facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://github.com/b/two' }] }],
        },
        embed: { external: { uri: 'https://github.com/c/three', title: 'three' } },
      })],
    })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag === 'ok' && result.value.posts[0]!.urls.sort()).toEqual([
      'https://github.com/a/one',
      'https://github.com/b/two',
      'https://github.com/c/three',
    ])
  })

  it('accepts an explicit null where a field could have been omitted', async () => {
    // The exact shape that broke the first production run: one post in a page
    // carried `record.embed.external: null`, and `optional()` rejects null.
    const { impl } = stubFetch([() => jsonResponse({
      posts: [rawPost({
        record: { text: 'x', createdAt: POSTED_AT, embed: { external: null }, langs: null },
        embed: null,
        cid: null,
      })],
    })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag === 'ok' && result.value.posts).toHaveLength(1)
    expect(result._tag === 'ok' && result.value.unparsable).toBe(0)
  })

  it('keeps the readable posts when one post in the page is unreadable', async () => {
    // The failure mode that turned one bad post into two dead queries: the
    // whole array was validated in a single pass, so any post could veto all
    // the others.
    const { impl } = stubFetch([() => jsonResponse({
      posts: [rawPost(), { uri: 'at://broken', author: 'not-an-object' }, rawPost({ uri: 'at://b' })],
    })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag).toBe('ok')
    expect(result._tag === 'ok' && result.value.posts).toHaveLength(2)
    expect(result._tag === 'ok' && result.value.unparsable).toBe(1)
    // Still counts what arrived, so the gap is measurable.
    expect(result._tag === 'ok' && result.value.postsRead).toBe(3)
  })

  it('drops a post with no createdAt rather than dating it from indexedAt', async () => {
    const { impl } = stubFetch([() => jsonResponse({
      posts: [rawPost({ record: { text: 'x' } }), rawPost()],
    })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag === 'ok' && result.value.posts).toHaveLength(1)
    // postsRead still counts what was on the wire, not what survived parsing.
    expect(result._tag === 'ok' && result.value.postsRead).toBe(2)
  })
})

describe('createBskyClient throttling', () => {
  it('treats a bare 403 as throttling and retries it', async () => {
    const { impl, callCount } = stubFetch([
      () => new Response('nope', { status: 403 }),
      () => jsonResponse({ posts: [rawPost()] }),
    ])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag).toBe('ok')
    expect(callCount()).toBe(2)
  })

  it('gives up as throttled after the attempt ceiling', async () => {
    const { impl, callCount } = stubFetch(
      Array.from({ length: 6 }, () => () => new Response('nope', { status: 403 })),
    )
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep, maxAttempts: 3 })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({ _tag: 'err', error: { _tag: 'throttled' } })
    expect(callCount()).toBe(3)
  })

  it('honours retry-after when the response supplies one', async () => {
    const waits: number[] = []
    const { impl } = stubFetch([
      () => new Response('slow down', { status: 429, headers: { 'retry-after': '12' } }),
      () => jsonResponse({ posts: [] }),
    ])
    const client = createBskyClient({
      fetchImpl: impl,
      sleepImpl: async (ms) => { waits.push(ms) },
    })

    await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(waits).toEqual([12_000])
  })

  it('does not retry a genuine server error', async () => {
    const { impl, callCount } = stubFetch([() => new Response('boom', { status: 500 })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({ _tag: 'err', error: { _tag: 'http-error', status: 500 } })
    expect(callCount()).toBe(1)
  })
})

describe('createBskyClient authentication', () => {
  const creds = { identifier: 'skilld.bsky.social', appPassword: 'aaaa-bbbb-cccc-dddd' }

  it('opens a session and calls the PDS with a bearer token', async () => {
    const { impl, urls, headers } = stubFetch([
      () => jsonResponse({ accessJwt: 'access', refreshJwt: 'refresh', did: 'did:plc:me' }),
      () => jsonResponse({ posts: [rawPost()] }),
    ])
    const client = createBskyClient({ ...creds, fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag).toBe('ok')
    expect(urls[0]).toContain('bsky.social/xrpc/com.atproto.server.createSession')
    expect(urls[1]).toContain('bsky.social/xrpc/app.bsky.feed.searchPosts')
    expect(headers[1]!.authorization).toBe('Bearer access')
    expect(client.isAuthenticated()).toBe(true)
  })

  it('reuses one session across calls', async () => {
    const { impl, urls } = stubFetch([
      () => jsonResponse({ accessJwt: 'access', refreshJwt: 'refresh', did: 'did:plc:me' }),
      () => jsonResponse({ posts: [] }),
      () => jsonResponse({ posts: [] }),
    ])
    const client = createBskyClient({ ...creds, fetchImpl: impl, sleepImpl: noSleep })

    await client.searchPosts({ query: 'a', since: POSTED_AT })
    await client.searchPosts({ query: 'b', since: POSTED_AT })

    expect(urls.filter(u => u.includes('createSession'))).toHaveLength(1)
  })

  it('re-authenticates once when the access token has expired', async () => {
    const { impl, urls } = stubFetch([
      () => jsonResponse({ accessJwt: 'stale', refreshJwt: 'r', did: 'did:plc:me' }),
      () => new Response('ExpiredToken', { status: 401 }),
      () => jsonResponse({ accessJwt: 'fresh', refreshJwt: 'r', did: 'did:plc:me' }),
      () => jsonResponse({ posts: [rawPost()] }),
    ])
    const client = createBskyClient({ ...creds, fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result._tag).toBe('ok')
    expect(urls.filter(u => u.includes('createSession'))).toHaveLength(2)
  })

  it('reports a rejected app password instead of falling back to anonymous reads', async () => {
    const { impl, urls } = stubFetch([() => new Response('bad password', { status: 401 })])
    const client = createBskyClient({ ...creds, fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({ _tag: 'err', error: { _tag: 'auth-failed' } })
    // A silent downgrade would look like a quiet day while being throttled
    // into uselessness, so no search is attempted at all.
    expect(urls.some(u => u.includes('searchPosts'))).toBe(false)
  })

  it('refuses to run with only an app password', async () => {
    // The real mistake this catches: BSKY_APP_PASSWORD set, BSKY_IDENTIFIER
    // forgotten. Falling back to anonymous reads would look like a quiet day
    // while being throttled, and nothing would ever say why.
    const { impl, callCount } = stubFetch([])
    const client = createBskyClient({ appPassword: 'aaaa-bbbb', fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({
      _tag: 'err',
      error: { _tag: 'incomplete-credentials', missing: 'identifier' },
    })
    expect(callCount()).toBe(0)
  })

  it('refuses to run with only an identifier', async () => {
    const { impl } = stubFetch([])
    const client = createBskyClient({ identifier: 'a.bsky.social', fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({
      _tag: 'err',
      error: { _tag: 'incomplete-credentials', missing: 'app-password' },
    })
  })

  it('still allows deliberate anonymous reads when neither is set', async () => {
    const { impl } = stubFetch([() => jsonResponse({ posts: [rawPost()] })])
    const client = createBskyClient({ fetchImpl: impl, sleepImpl: noSleep })

    expect((await client.searchPosts({ query: 'q', since: POSTED_AT }))._tag).toBe('ok')
  })

  it('stops after a second 401 rather than looping on re-authentication', async () => {
    const { impl, callCount } = stubFetch([
      () => jsonResponse({ accessJwt: 'a', refreshJwt: 'r', did: 'did:plc:me' }),
      () => new Response('expired', { status: 401 }),
      () => jsonResponse({ accessJwt: 'b', refreshJwt: 'r', did: 'did:plc:me' }),
      () => new Response('expired', { status: 401 }),
    ])
    const client = createBskyClient({ ...creds, fetchImpl: impl, sleepImpl: noSleep })

    const result = await client.searchPosts({ query: 'q', since: POSTED_AT })

    expect(result).toMatchObject({ _tag: 'err', error: { _tag: 'auth-failed' } })
    expect(callCount()).toBe(4)
  })
})

describe('describeBskyError', () => {
  it('names the retry window when one is known', () => {
    expect(describeBskyError({ _tag: 'throttled', retryAfter: 30 }))
      .toBe('throttled by the AppView, retry after 30s')
  })
})
