/**
 * Minimal X (Twitter) API v2 client for trending discovery.
 *
 * No SDK. The two endpoints we need are plain GETs with a bearer token, and
 * `@xdevplatform/twitter-api-sdk` pulls a Node-shaped HTTP stack that does not
 * belong in a Worker bundle. What the SDK would give us that matters is the
 * response types, and those are recovered here by parsing at the boundary.
 *
 * COST MODEL — read this before changing any caller.
 * Every post object returned counts 1 against the project's monthly post cap
 * (measured empirically: `/2/usage/tweets` rose 47 -> 155 after 108 posts were
 * returned). Two consequences shape the design:
 *
 *   1. Discovery MUST pass `since_id`. With a cursor, each published post is
 *      read exactly once, so monthly spend tracks how much the world tweets,
 *      not how often we poll. Drop the cursor and spend becomes
 *      O(poll frequency), which is how a cap gets burned in a weekend.
 *   2. Engagement refresh re-reads posts we already hold, so it is the one
 *      caller whose spend really is O(frequency x tracked posts). It is tiered
 *      and floored at the call site for exactly this reason.
 *
 * Callers get a tagged result rather than exceptions, because rate limiting
 * and cap exhaustion are expected operating conditions for a scheduled task,
 * not faults. A cron run that hits a 429 should record the reason and reschedule,
 * which it cannot do if the failure mode is an unrecoverable throw.
 */

import { z } from 'zod'

const X_API_BASE = 'https://api.x.com/2'

/** Max ids accepted by `GET /2/tweets` in one call. */
export const X_LOOKUP_BATCH_SIZE = 100
/** Max results accepted by `GET /2/tweets/search/recent` in one page. */
export const X_SEARCH_PAGE_SIZE = 100

const publicMetricsSchema = z.object({
  like_count: z.number().int().nonnegative().catch(0),
  retweet_count: z.number().int().nonnegative().catch(0),
  reply_count: z.number().int().nonnegative().catch(0),
  quote_count: z.number().int().nonnegative().catch(0),
  bookmark_count: z.number().int().nonnegative().catch(0),
  impression_count: z.number().int().nonnegative().catch(0),
})

const urlEntitySchema = z.object({
  expanded_url: z.string().optional(),
  unwound_url: z.string().optional(),
  display_url: z.string().optional(),
})

const rawPostSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  lang: z.string().optional(),
  public_metrics: publicMetricsSchema.optional(),
  entities: z.object({ urls: z.array(urlEntitySchema).optional() }).optional(),
  // Long-form posts truncate `text` at 280 chars and put the full body here.
  // A thread listing ten skill repos is exactly the post we most want to read,
  // and ignoring note_tweet would silently drop most of its links.
  note_tweet: z.object({
    text: z.string().optional(),
    entities: z.object({ urls: z.array(urlEntitySchema).optional() }).optional(),
  }).optional(),
  conversation_id: z.string().optional(),
  // Long-form Articles. Everything worth reading lives here rather than in
  // `text`, including fenced code blocks that often carry an install command.
  article: z.object({
    title: z.string().optional(),
    plain_text: z.string().optional(),
    entities: z.object({
      urls: z.array(z.object({ text: z.string().optional() })).optional(),
      code: z.array(z.object({ code: z.string().optional() })).optional(),
    }).optional(),
  }).optional(),
})

const rawUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().optional(),
  profile_image_url: z.string().optional(),
  public_metrics: z.object({
    followers_count: z.number().int().nonnegative().catch(0),
  }).optional(),
})

const rawResponseSchema = z.object({
  data: z.array(rawPostSchema).optional(),
  includes: z.object({ users: z.array(rawUserSchema).optional() }).optional(),
  meta: z.object({
    newest_id: z.string().optional(),
    oldest_id: z.string().optional(),
    next_token: z.string().optional(),
    result_count: z.number().int().optional(),
  }).optional(),
})

/**
 * A post after parsing: metrics and author are always present, urls are
 * flattened across `entities` and `note_tweet.entities`, and `text` is the
 * long-form body when there is one. Downstream code never re-checks any of it.
 */
export interface XPost {
  id: string
  text: string
  lang: string | null
  /** Unix seconds. */
  postedAt: number
  authorId: string
  authorHandle: string
  authorName: string | null
  authorFollowers: number
  metrics: XPostMetrics
  /** Every expanded URL found on the post, de-duplicated. */
  urls: string[]
  /** Thread root. Equal to `id` when the post is itself the root. */
  conversationId: string | null
  /** Article title, when the post is an X Article. Often names the skill. */
  articleTitle: string | null
  /** Article body as plain text, where the real write-up lives. */
  articleText: string | null
  /**
   * Fenced code blocks from an Article. These carry install commands verbatim,
   * which is the highest-precision skill reference the platform offers.
   */
  articleCode: string[]
}

export interface XPostMetrics {
  favouriteCount: number
  repostCount: number
  replyCount: number
  quoteCount: number
  bookmarkCount: number
  impressionCount: number
}

export const ZERO_METRICS: XPostMetrics = {
  favouriteCount: 0,
  repostCount: 0,
  replyCount: 0,
  quoteCount: 0,
  bookmarkCount: 0,
  impressionCount: 0,
}

export interface XPage {
  posts: XPost[]
  /** Highest post id in this page, for advancing the ingest cursor. */
  newestId: string | null
  /** Pagination token; absent when the window is exhausted. */
  nextToken: string | null
  /** Posts returned, which equals the cap units this call consumed. */
  postsRead: number
}

/**
 * Expected failures. `rate-limited` and `cap-exceeded` are distinct because
 * the recoveries differ: the first clears on a known reset timestamp, the
 * second not until the monthly cap resets and must not be retried in-run.
 */
export type XError
  = | { _tag: 'not-configured' }
  /**
   * A local dev server tried to spend real money. `.dev.vars` symlinks to
   * `.env`, so a working bearer token is present locally and nothing else
   * would stop a task run, a hot reload loop, or a stray `/_nitro/tasks`
   * request from billing the account. One such session spent 302 reads before
   * this guard existed. Set X_ALLOW_LOCAL_API=1 to opt in deliberately.
   */
    | { _tag: 'local-blocked' }
    | { _tag: 'rate-limited', resetAt: number | null }
    | { _tag: 'cap-exceeded' }
    | { _tag: 'unauthorized' }
    | { _tag: 'http-error', status: number, body: string }
    | { _tag: 'malformed-response', message: string }

export type XResult<T> = { _tag: 'ok', value: T } | { _tag: 'err', error: XError }

const ok = <T>(value: T): XResult<T> => ({ _tag: 'ok', value })
const err = <T>(error: XError): XResult<T> => ({ _tag: 'err', error })

export function describeXError(error: XError): string {
  switch (error._tag) {
    case 'not-configured':
      return 'X_BEARER_KEY is not set'
    case 'local-blocked':
      return 'blocked: real X API calls are disabled outside production (set X_ALLOW_LOCAL_API=1 to override)'
    case 'rate-limited':
      return `rate limited${error.resetAt ? ` until ${new Date(error.resetAt * 1000).toISOString()}` : ''}`
    case 'cap-exceeded':
      return 'monthly X cap reached'
    case 'unauthorized':
      return 'bearer token rejected'
    case 'http-error':
      return `HTTP ${error.status}: ${error.body.slice(0, 200)}`
    case 'malformed-response':
      return `malformed response: ${error.message}`
  }
}

export interface XClient {
  /**
   * One page of `GET /2/tweets/search/recent`.
   *
   * `sinceId` is not optional by accident: see the cost model above. Pass null
   * only for a cold start where no cursor exists yet.
   */
  searchRecent: (input: {
    query: string
    sinceId: string | null
    nextToken?: string | null
    maxResults?: number
  }) => Promise<XResult<XPage>>

  /** `GET /2/tweets?ids=` for up to {@link X_LOOKUP_BATCH_SIZE} ids. */
  lookupPosts: (ids: string[]) => Promise<XResult<XPage>>

  /** Current monthly cap consumption, for observability and the cost guard. */
  usage: () => Promise<XResult<{ used: number, cap: number, resetDay: number }>>
}

export interface CreateXClientOptions {
  bearerToken: string | undefined
  /** Injected so tests drive the client without a network or a token. */
  fetchImpl?: typeof fetch
  /**
   * Whether real network calls are permitted. Defaults to "only outside a dev
   * server", so local work cannot bill the account by accident. Tests pass
   * their own `fetchImpl` and set this explicitly.
   */
  allowNetwork?: boolean
}

/**
 * True only on a local dev server.
 *
 * `import.meta.dev` must appear verbatim: the bundler replaces that exact
 * expression at build time. An earlier version wrote
 * `(import.meta as { dev?: boolean }).dev`, which reads identically in
 * TypeScript but is no longer the literal the replacement matches, so it
 * evaluated undefined and the guard silently allowed every local call. A dev
 * server then read 8 posts against the live budget while appearing guarded.
 *
 * NODE_ENV is checked as well so the guard does not depend on a single
 * build-time substitution working.
 */
function isDevServer(): boolean {
  return import.meta.dev === true || process.env.NODE_ENV === 'development'
}

function localCallsAllowed(): boolean {
  if (!isDevServer())
    return true
  // Opt in per shell when a real local call is genuinely wanted:
  //   X_ALLOW_LOCAL_API=1 pnpm dev
  return process.env.X_ALLOW_LOCAL_API === '1'
}

/**
 * `article` and `conversation_id` are the two that are not obvious.
 *
 * An X Article keeps its real content out of `text`, which holds only the
 * t.co link. dexhorthy's /show-me post is the canonical case: 6,614 bookmarks,
 * the skill name in `article.title`, and the install command sitting in
 * `article.entities.code`. Without this field that post reads as an empty link.
 *
 * `conversation_id` is what lets a later step walk a thread to find the repo
 * link an author put in a reply rather than the root post.
 */
const POST_FIELDS = 'created_at,public_metrics,entities,lang,author_id,note_tweet,article,conversation_id'
const USER_FIELDS = 'username,name,profile_image_url,public_metrics'

function collectUrls(post: z.infer<typeof rawPostSchema>): string[] {
  const out = new Set<string>()
  const push = (entities: { urls?: z.infer<typeof urlEntitySchema>[] } | undefined) => {
    for (const u of entities?.urls ?? []) {
      // `unwound_url` is the real destination when X resolved a redirect chain;
      // `expanded_url` is the t.co target, which for a shared post is an x.com
      // permalink rather than the GitHub repo the author meant to point at.
      const resolved = u.unwound_url ?? u.expanded_url
      if (resolved)
        out.add(resolved)
    }
  }
  push(post.entities)
  push(post.note_tweet?.entities)
  return [...out]
}

function toXPost(
  raw: z.infer<typeof rawPostSchema>,
  users: Map<string, z.infer<typeof rawUserSchema>>,
): XPost | null {
  // A post with no author cannot be attributed or displayed as proof, and a
  // post with no timestamp cannot be ranked by recency. Both are dropped
  // rather than defaulted, so a bad row never ranks as brand new.
  if (!raw.author_id || !raw.created_at)
    return null
  const postedAt = Math.floor(new Date(raw.created_at).getTime() / 1000)
  if (!Number.isFinite(postedAt))
    return null
  const user = users.get(raw.author_id)
  const m = raw.public_metrics
  return {
    id: raw.id,
    text: raw.note_tweet?.text ?? raw.text,
    lang: raw.lang ?? null,
    postedAt,
    authorId: raw.author_id,
    authorHandle: user?.username ?? raw.author_id,
    authorName: user?.name ?? null,
    authorFollowers: user?.public_metrics?.followers_count ?? 0,
    conversationId: raw.conversation_id ?? null,
    articleTitle: raw.article?.title ?? null,
    articleText: raw.article?.plain_text ?? null,
    articleCode: (raw.article?.entities?.code ?? [])
      .map(c => c.code)
      .filter((c): c is string => typeof c === 'string'),
    metrics: m
      ? {
          favouriteCount: m.like_count,
          repostCount: m.retweet_count,
          replyCount: m.reply_count,
          quoteCount: m.quote_count,
          bookmarkCount: m.bookmark_count,
          impressionCount: m.impression_count,
        }
      : ZERO_METRICS,
    urls: collectUrls(raw),
  }
}

function classifyFailure(status: number, headers: Headers, body: string): XError {
  if ((status === 403 || status === 429)
    && /spend-cap-reached|spend cap has been reached|usage.?cap.?exceeded|monthly product cap/i.test(body)) {
    return { _tag: 'cap-exceeded' }
  }
  if (status === 401 || status === 403)
    return { _tag: 'unauthorized' }
  if (status === 429) {
    const reset = Number(headers.get('x-rate-limit-reset'))
    return { _tag: 'rate-limited', resetAt: Number.isFinite(reset) && reset > 0 ? reset : null }
  }
  return { _tag: 'http-error', status, body }
}

export function createXClient(options: CreateXClientOptions): XClient {
  const { bearerToken } = options
  const doFetch = options.fetchImpl ?? fetch
  // Resolved once at construction: every caller funnels through `request` and
  // `usage`, so this is the only place a paid call can start.
  const networkAllowed = options.allowNetwork ?? localCallsAllowed()

  async function request(path: string, params: Record<string, string>): Promise<XResult<XPage>> {
    if (!bearerToken)
      return err({ _tag: 'not-configured' })
    if (!networkAllowed)
      return err({ _tag: 'local-blocked' })

    const url = new URL(`${X_API_BASE}${path}`)
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, v)

    const res = await doFetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${bearerToken}`, 'User-Agent': 'skilld.dev' },
    })

    if (!res.ok)
      return err(classifyFailure(res.status, res.headers, await res.text()))

    const parsed = rawResponseSchema.safeParse(await res.json())
    if (!parsed.success)
      return err({ _tag: 'malformed-response', message: parsed.error.message })

    const users = new Map((parsed.data.includes?.users ?? []).map(u => [u.id, u]))
    const raw = parsed.data.data ?? []
    const posts = raw.map(p => toXPost(p, users)).filter((p): p is XPost => p !== null)

    return ok({
      posts,
      newestId: parsed.data.meta?.newest_id ?? null,
      nextToken: parsed.data.meta?.next_token ?? null,
      // Count what the API returned, not what survived parsing: the cap was
      // charged for every object on the wire.
      postsRead: raw.length,
    })
  }

  return {
    async searchRecent({ query, sinceId, nextToken, maxResults }) {
      const params: Record<string, string> = {
        'query': query,
        'max_results': String(Math.min(maxResults ?? X_SEARCH_PAGE_SIZE, X_SEARCH_PAGE_SIZE)),
        'tweet.fields': POST_FIELDS,
        'expansions': 'author_id',
        'user.fields': USER_FIELDS,
      }
      if (sinceId)
        params.since_id = sinceId
      if (nextToken)
        params.pagination_token = nextToken
      return await request('/tweets/search/recent', params)
    },

    async lookupPosts(ids) {
      if (ids.length === 0)
        return ok({ posts: [], newestId: null, nextToken: null, postsRead: 0 })
      if (ids.length > X_LOOKUP_BATCH_SIZE)
        return err({ _tag: 'malformed-response', message: `lookupPosts accepts at most ${X_LOOKUP_BATCH_SIZE} ids` })
      return await request('/tweets', {
        'ids': ids.join(','),
        'tweet.fields': POST_FIELDS,
        'expansions': 'author_id',
        'user.fields': USER_FIELDS,
      })
    },

    async usage() {
      if (!bearerToken)
        return err({ _tag: 'not-configured' })
      if (!networkAllowed)
        return err({ _tag: 'local-blocked' })
      const res = await doFetch(`${X_API_BASE}/usage/tweets`, {
        headers: { 'Authorization': `Bearer ${bearerToken}`, 'User-Agent': 'skilld.dev' },
      })
      if (!res.ok)
        return err(classifyFailure(res.status, res.headers, await res.text()))
      const parsed = z.object({
        data: z.object({
          project_usage: z.coerce.number(),
          project_cap: z.coerce.number(),
          cap_reset_day: z.coerce.number(),
        }),
      }).safeParse(await res.json())
      if (!parsed.success)
        return err({ _tag: 'malformed-response', message: parsed.error.message })
      return ok({
        used: parsed.data.data.project_usage,
        cap: parsed.data.data.project_cap,
        resetDay: parsed.data.data.cap_reset_day,
      })
    },
  }
}
