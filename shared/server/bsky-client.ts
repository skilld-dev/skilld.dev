/**
 * Minimal Bluesky (AT Protocol) client for trending discovery.
 *
 * COST MODEL — the opposite of the X client's, and that is the whole point.
 * Nothing here is metered. There is no post cap, no per-read charge and no
 * monthly budget, so none of the machinery that shapes `x-client.ts` (since_id
 * discipline, daily read budgets, refresh tiering) is needed. The only limit is
 * request rate, and a full discovery run is a few dozen requests every quarter
 * hour against a documented 3,000 per five minutes.
 *
 * WHY NOT JETSTREAM. The firehose would mean an always-on WebSocket, which on
 * Workers means a Durable Object billed for wall-clock duration, filtering
 * every post on the network to find roughly two a day worth keeping. Polling
 * search is the cheap shape here, not the compromise.
 *
 * AUTH IS OPTIONAL BUT WANTED. `https://api.bsky.app` answers `searchPosts`
 * with no token at all, which is what makes this source free to trial. It
 * throttles hard though: a probe hit 403s after about fifteen requests, and it
 * signals throttling with 403 and no reset header rather than 429. With an app
 * password the same calls go through the PDS at `https://bsky.social`, which
 * proxies to the AppView under the account's own far higher limit. Production
 * should always be authenticated; the unauthenticated path exists so a missing
 * secret degrades instead of failing.
 *
 * Like the X client, callers get a tagged result rather than exceptions:
 * throttling is an expected operating condition for a scheduled task, not a
 * fault.
 */

import { z } from 'zod'

/** Unauthenticated AppView. Answers search, throttles aggressively. */
const BSKY_PUBLIC_BASE = 'https://api.bsky.app'
/** The PDS. Issues sessions and proxies `app.bsky.*` to the AppView. */
const BSKY_PDS_BASE = 'https://bsky.social'

/** Max results `app.bsky.feed.searchPosts` accepts in one page. */
export const BSKY_SEARCH_PAGE_SIZE = 100

/**
 * `.nullish()` everywhere, not `.optional()`.
 *
 * AT Protocol records serialize an absent field as an explicit `null` as often
 * as they omit it, and `optional()` accepts only the omission. Production hit
 * this on the first run: one post in a page of 100 carried
 * `record.embed.external: null`, which failed the parse.
 */
const externalEmbedSchema = z.object({
  uri: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
})

const rawPostSchema = z.object({
  uri: z.string(),
  cid: z.string().nullish(),
  author: z.object({
    did: z.string(),
    handle: z.string(),
    displayName: z.string().nullish(),
    avatar: z.string().nullish(),
  }),
  record: z.object({
    text: z.string().nullish(),
    createdAt: z.string().nullish(),
    langs: z.array(z.string()).nullish(),
    // Link facets are the reliable source of URLs: Bluesky stores the target
    // separately from the display text, so a post rendering "github.com/a/b…"
    // truncated still carries the full URI here.
    facets: z.array(z.object({
      features: z.array(z.object({
        $type: z.string().nullish(),
        uri: z.string().nullish(),
      })).nullish(),
    })).nullish(),
    embed: z.object({ external: externalEmbedSchema.nullish() }).nullish(),
  }),
  // The hydrated view of the embed, which carries the resolved card. Present
  // on the post rather than the record when the AppView expanded it.
  embed: z.object({ external: externalEmbedSchema.nullish() }).nullish(),
  likeCount: z.number().int().nonnegative().catch(0).nullish(),
  repostCount: z.number().int().nonnegative().catch(0).nullish(),
  replyCount: z.number().int().nonnegative().catch(0).nullish(),
  quoteCount: z.number().int().nonnegative().catch(0).nullish(),
  indexedAt: z.string().nullish(),
})

/**
 * The envelope only. Posts stay `unknown` here and are parsed one at a time in
 * `searchPosts`, so a single unrecognised post cannot reject the whole page.
 */
const searchResponseSchema = z.object({
  posts: z.array(z.unknown()).nullish(),
  cursor: z.string().nullish(),
})

const sessionSchema = z.object({
  accessJwt: z.string(),
  refreshJwt: z.string(),
  did: z.string(),
  handle: z.string().optional(),
})

/**
 * A Bluesky post after parsing.
 *
 * Deliberately not `XPost`. The two platforms do not report the same things:
 * Bluesky has no bookmark count, no impression count and no follower count on
 * a search result, and X has no equivalent of a DID. Widening one type to hold
 * both would mean four fields that are always zero on one side, which is
 * exactly the optional-field soup that makes downstream ranking bugs possible.
 */
export interface BskyPost {
  /** AT-URI: `at://did:plc:.../app.bsky.feed.post/<rkey>`. The primary key. */
  uri: string
  text: string
  lang: string | null
  /** Unix seconds. */
  postedAt: number
  authorDid: string
  authorHandle: string
  authorName: string | null
  /** CDN avatar URL from the hydrated author view. Null when the author set none. */
  authorAvatar: string | null
  metrics: BskyMetrics
  /** Every URL on the post: link facets, embed card, and bare text links. */
  urls: string[]
  /** Embed card title and description, where a shared link describes itself. */
  cardText: string | null
}

export interface BskyMetrics {
  likeCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
}

export const ZERO_BSKY_METRICS: BskyMetrics = {
  likeCount: 0,
  repostCount: 0,
  replyCount: 0,
  quoteCount: 0,
}

export interface BskyPage {
  posts: BskyPost[]
  /** Pagination cursor; absent when the result set is exhausted. */
  cursor: string | null
  /** Posts returned on the wire, before parsing dropped any. */
  postsRead: number
  /** Posts the schema could not read. A rising value means the API drifted. */
  unparsable: number
}

/**
 * Expected failures.
 *
 * `throttled` is separate from `http-error` because the AppView answers a rate
 * limit with 403 and no reset header, which is indistinguishable from a real
 * authorization failure by status alone. Treating it as `unauthorized` would
 * make a run give up permanently on a condition that clears in seconds.
 */
export type BskyError
  = | { _tag: 'throttled', retryAfter: number | null }
    | { _tag: 'auth-failed', message: string }
  /**
   * One credential set and not the other.
   *
   * Reported rather than treated as "no credentials", because the two states
   * look identical from the outside and mean opposite things. Setting only
   * `BSKY_APP_PASSWORD` and getting anonymous reads is a configuration
   * mistake that presents as a quiet, throttled run; the operator believes
   * the source is authenticated and nothing ever says otherwise.
   */
    | { _tag: 'incomplete-credentials', missing: 'identifier' | 'app-password' }
    | { _tag: 'http-error', status: number, body: string }
    | { _tag: 'malformed-response', message: string }

export type BskyResult<T> = { _tag: 'ok', value: T } | { _tag: 'err', error: BskyError }

const ok = <T>(value: T): BskyResult<T> => ({ _tag: 'ok', value })
const err = <T>(error: BskyError): BskyResult<T> => ({ _tag: 'err', error })

export function describeBskyError(error: BskyError): string {
  switch (error._tag) {
    case 'throttled':
      return `throttled by the AppView${error.retryAfter ? `, retry after ${error.retryAfter}s` : ''}`
    case 'auth-failed':
      return `app password rejected: ${error.message}`
    case 'incomplete-credentials':
      return `BSKY credentials are half set: ${error.missing} is missing`
    case 'http-error':
      return `HTTP ${error.status}: ${error.body.slice(0, 200)}`
    case 'malformed-response':
      return `malformed response: ${error.message}`
  }
}

export interface BskyClient {
  /**
   * One page of `app.bsky.feed.searchPosts`.
   *
   * `since` bounds the window so a run never walks the whole archive. It is an
   * ISO timestamp rather than an id because AT-URIs carry no ordering.
   */
  searchPosts: (input: {
    query: string
    since: string
    cursor?: string | null
    limit?: number
  }) => Promise<BskyResult<BskyPage>>

  /** True when an app password was supplied and a session was established. */
  isAuthenticated: () => boolean
}

export interface CreateBskyClientOptions {
  /** Handle or DID, e.g. `skilld.bsky.social`. Omit for unauthenticated reads. */
  identifier?: string | undefined
  /** App password, `xxxx-xxxx-xxxx-xxxx`. Never the account password. */
  appPassword?: string | undefined
  /** Injected so tests drive the client without a network. */
  fetchImpl?: typeof fetch
  /**
   * Attempts per request when the AppView throttles. Each retry waits
   * `retryAfter` when the response supplies one, otherwise a doubling backoff.
   */
  maxAttempts?: number
  /** Injected so tests do not actually wait out a backoff. */
  sleepImpl?: (ms: number) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 2000

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * URLs from all three places a Bluesky post can carry one.
 *
 * The bare-text scan is not redundant with facets. A post written by a client
 * that did not build facets, or an AT-URI pasted as plain text, has no facet
 * at all, and those are disproportionately the hand-written developer posts
 * this source exists to find.
 */
function collectUrls(raw: z.infer<typeof rawPostSchema>): string[] {
  const out = new Set<string>()
  for (const facet of raw.record.facets ?? []) {
    for (const feature of facet.features ?? []) {
      if (feature.uri)
        out.add(feature.uri)
    }
  }
  const card = raw.embed?.external ?? raw.record.embed?.external
  if (card?.uri)
    out.add(card.uri)
  for (const match of (raw.record.text ?? '').matchAll(/https?:\/\/\S+/g)) {
    // Trailing sentence punctuation is not part of the URL. Left in, it turns
    // `github.com/a/b.` into the repo `a/b.` and the ledger fills with names
    // that can never resolve.
    out.add(match[0].replace(/[.,;:!?)\]}>"']+$/, ''))
  }
  return [...out]
}

function toBskyPost(raw: z.infer<typeof rawPostSchema>): BskyPost | null {
  // A post with no timestamp cannot be ranked by recency, and `indexedAt` is
  // not a substitute: it is when the AppView saw the post, which for a
  // backfilled account is wildly later than when it was written.
  const createdAt = raw.record.createdAt
  if (!createdAt)
    return null
  const postedAt = Math.floor(new Date(createdAt).getTime() / 1000)
  if (!Number.isFinite(postedAt))
    return null

  const card = raw.embed?.external ?? raw.record.embed?.external
  const cardText = [card?.title, card?.description].filter(Boolean).join('\n') || null

  return {
    uri: raw.uri,
    text: raw.record.text ?? '',
    lang: raw.record.langs?.[0] ?? null,
    postedAt,
    authorDid: raw.author.did,
    authorHandle: raw.author.handle,
    authorName: raw.author.displayName ?? null,
    authorAvatar: raw.author.avatar ?? null,
    metrics: {
      likeCount: raw.likeCount ?? 0,
      repostCount: raw.repostCount ?? 0,
      replyCount: raw.replyCount ?? 0,
      quoteCount: raw.quoteCount ?? 0,
    },
    urls: collectUrls(raw),
    cardText,
  }
}

/**
 * A 403 from the AppView means throttled far more often than it means
 * forbidden, because the unauthenticated endpoint has no other way to say so.
 * `ratelimit-reset` is an absolute unix second when present.
 */
function classifyFailure(status: number, headers: Headers, body: string): BskyError {
  if (status === 429 || status === 403) {
    const retryAfter = Number(headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0)
      return { _tag: 'throttled', retryAfter }
    const reset = Number(headers.get('ratelimit-reset'))
    if (Number.isFinite(reset) && reset > 0)
      return { _tag: 'throttled', retryAfter: Math.max(1, reset - Math.floor(Date.now() / 1000)) }
    return { _tag: 'throttled', retryAfter: null }
  }
  if (status === 401)
    return { _tag: 'auth-failed', message: body.slice(0, 200) }
  return { _tag: 'http-error', status, body }
}

export function createBskyClient(options: CreateBskyClientOptions): BskyClient {
  const doFetch = options.fetchImpl ?? fetch
  const sleep = options.sleepImpl ?? defaultSleep
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const { identifier, appPassword } = options
  const wantsAuth = Boolean(identifier && appPassword)
  // Half-configured is a mistake, not a choice. Anonymous reads are a
  // deliberate fallback only when neither value is present.
  const incomplete: BskyError | null
    = identifier && !appPassword
      ? { _tag: 'incomplete-credentials', missing: 'app-password' }
      : appPassword && !identifier
        ? { _tag: 'incomplete-credentials', missing: 'identifier' }
        : null

  // Held across calls within one client instance, which is one task run. Not a
  // module-level singleton: a session belongs to the client that created it,
  // and a stale one leaking between runs is how a hard-to-place 401 happens.
  let session: z.infer<typeof sessionSchema> | null = null

  async function createSession(): Promise<BskyResult<z.infer<typeof sessionSchema>>> {
    const res = await doFetch(`${BSKY_PDS_BASE}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'skilld.dev' },
      body: JSON.stringify({ identifier, password: appPassword }),
    })
    if (!res.ok)
      return err({ _tag: 'auth-failed', message: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` })
    const parsed = sessionSchema.safeParse(await res.json())
    if (!parsed.success)
      return err({ _tag: 'malformed-response', message: parsed.error.message })
    session = parsed.data
    return ok(parsed.data)
  }

  /**
   * One authenticated-or-not GET, with throttle backoff and a single
   * re-authentication on an expired session.
   */
  async function request(
    method: string,
    params: Record<string, string>,
  ): Promise<BskyResult<unknown>> {
    if (incomplete)
      return err(incomplete)

    if (wantsAuth && !session) {
      const created = await createSession()
      // A rejected app password is reported, not silently downgraded to
      // anonymous reads: a run that quietly loses auth looks identical to a
      // quiet day, and would be throttled into uselessness without saying why.
      if (created._tag === 'err')
        return created
    }

    let reauthed = false
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const base = session ? BSKY_PDS_BASE : BSKY_PUBLIC_BASE
      const url = new URL(`${base}/xrpc/${method}`)
      for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v)

      const headers: Record<string, string> = { 'user-agent': 'skilld.dev' }
      if (session)
        headers.authorization = `Bearer ${session.accessJwt}`

      const res = await doFetch(url.toString(), { headers })
      if (res.ok)
        return ok(await res.json())

      const failure = classifyFailure(res.status, res.headers, await res.text())

      // An expired access token reads as 401. Re-authenticate once, then treat
      // a second 401 as a real credential problem rather than looping.
      if (failure._tag === 'auth-failed' && wantsAuth && !reauthed) {
        reauthed = true
        session = null
        const created = await createSession()
        if (created._tag === 'err')
          return created
        continue
      }

      if (failure._tag !== 'throttled')
        return err(failure)
      if (attempt === maxAttempts - 1)
        return err(failure)

      await sleep(failure.retryAfter ? failure.retryAfter * 1000 : BASE_BACKOFF_MS * 2 ** attempt)
    }

    return err({ _tag: 'throttled', retryAfter: null })
  }

  return {
    isAuthenticated: () => session !== null,

    async searchPosts({ query, since, cursor, limit }) {
      const params: Record<string, string> = {
        q: query,
        limit: String(Math.min(limit ?? BSKY_SEARCH_PAGE_SIZE, BSKY_SEARCH_PAGE_SIZE)),
        // Newest first, so a run that stops early keeps the freshest results
        // rather than an arbitrary slice.
        sort: 'latest',
        since,
      }
      if (cursor)
        params.cursor = cursor

      const result = await request('app.bsky.feed.searchPosts', params)
      if (result._tag === 'err')
        return result

      // The envelope is parsed strictly; each post is parsed on its own.
      //
      // ONE BAD POST MUST NOT COST THE PAGE. Validating the whole array in a
      // single pass makes every post a veto over all the others, and that is
      // what happened on the first production run: one post in a hundred
      // carried `record.embed.external: null`, and both the `"agent skill"`
      // and `"agent skills"` queries returned nothing at all as a result.
      // Widening the schema fixed that shape; parsing per post is what stops
      // the next unknown shape from doing the same thing.
      const envelope = searchResponseSchema.safeParse(result.value)
      if (!envelope.success)
        return err({ _tag: 'malformed-response', message: envelope.error.message })

      const raw = envelope.data.posts ?? []
      const posts: BskyPost[] = []
      let unparsable = 0
      for (const entry of raw) {
        const parsed = rawPostSchema.safeParse(entry)
        if (!parsed.success) {
          unparsable += 1
          continue
        }
        const post = toBskyPost(parsed.data)
        if (post)
          posts.push(post)
      }

      return ok({
        posts,
        cursor: envelope.data.cursor ?? null,
        // Counts what arrived, not what survived, so a rising `unparsable`
        // shows up as a widening gap rather than as silence.
        postsRead: raw.length,
        unparsable,
      })
    },
  }
}
