/// <reference types="@cloudflare/workers-types" />

// First-party open/click instrumentation for digest emails. Ported from the
// nuxtseo.com notifications module's open-tracking design (opaque HMAC token,
// silent no-op pixel route) and extended with click-through link wrapping.
//
// Token shape mirrors signUnsubToken in ./email.ts:
//   base64url(JSON payload) + '.' + base64url(HMAC-SHA256 signature)
// Payload = { r: runId, e: 'open' | 'click', u?: destination URL, exp }.
// Signed with the same secret (NUXT_TOKEN_KEY) so tracking URLs are not
// enumerable. TTL is 90 days — long enough for a mail client to lazily fetch
// remote images, not forever.

import { b64urlDecode, b64urlEncode, hmacKey } from './email'

const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60

const enc = new TextEncoder()
const dec = new TextDecoder()

export type DigestEventKind = 'open' | 'click'

export interface DigestEventTokenPayload {
  r: number
  e: DigestEventKind
  u?: string
  exp: number
}

export type DigestEventTokenInput
  = { runId: number, event: 'open' }
    | { runId: number, event: 'click', url: string }

export async function signDigestEventToken(
  input: DigestEventTokenInput,
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!secret)
    throw new Error('digest tracking signing secret missing')
  const payload: DigestEventTokenPayload = {
    r: input.runId,
    e: input.event,
    ...(input.event === 'click' ? { u: input.url } : {}),
    exp: now() + TOKEN_TTL_SECONDS,
  }
  const encoded = b64urlEncode(enc.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(encoded))
  return `${encoded}.${b64urlEncode(sig)}`
}

export async function verifyDigestEventToken(
  token: string,
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<DigestEventTokenPayload | null> {
  if (!secret || !token.includes('.'))
    return null
  const [encoded, sig, extra] = token.split('.')
  if (!encoded || !sig || extra !== undefined)
    return null
  const valid = await hmacKey(secret)
    .then(key => crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(encoded)))
    .catch(() => false)
  if (!valid)
    return null
  const parsed = ((): Partial<DigestEventTokenPayload> | null => {
    try {
      return JSON.parse(dec.decode(b64urlDecode(encoded))) as Partial<DigestEventTokenPayload>
    }
    catch {
      return null
    }
  })()
  if (
    !parsed
    || typeof parsed.r !== 'number'
    || !Number.isInteger(parsed.r)
    || parsed.r <= 0
    || (parsed.e !== 'open' && parsed.e !== 'click')
    || typeof parsed.exp !== 'number'
    || parsed.exp < now()
  ) {
    return null
  }
  if (parsed.e === 'click' && !isTrackableUrl(parsed.u))
    return null
  return parsed as DigestEventTokenPayload
}

function isTrackableUrl(url: unknown): url is string {
  if (typeof url !== 'string')
    return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  }
  catch {
    return false
  }
}

/**
 * Stable per-link identity for click aggregation, derived from the
 * destination at record time so the token stays small:
 *   skill:<owner>/<repo>/<name>  — skilld skill detail pages
 *   github:<owner>/<repo>       — GitHub repo links
 *   url:<host><path>            — everything else
 */
export function linkKeyForUrl(url: string): string {
  const parsed = ((): URL | null => {
    try {
      return new URL(url)
    }
    catch {
      return null
    }
  })()
  if (!parsed)
    return `url:${url}`
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (parsed.hostname.endsWith('skilld.dev') && segments[0] === 'gh' && segments.length >= 4)
    return `skill:${segments[1]}/${segments[2]}/${decodeURIComponent(segments[3]!)}`
  if (parsed.hostname === 'github.com' && segments.length >= 2)
    return `github:${segments[0]}/${segments[1]}`
  return `url:${parsed.hostname}${parsed.pathname}`
}

// --- HTML instrumentation -------------------------------------------------

export interface InstrumentDigestHtmlInput {
  runId: number
  siteUrl: string
  secret: string
  now?: () => number
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function shouldWrapHref(url: string): boolean {
  if (!/^https?:\/\//i.test(url))
    return false
  // The unsubscribe link must stay a direct RFC 8058-compatible URL; wrapping
  // it would also record "clicks" for one-click unsubscribes.
  if (url.includes('/api/unsubscribe'))
    return false
  // Never double-wrap.
  if (url.includes('/api/digest/click'))
    return false
  return true
}

/**
 * Post-processes rendered digest HTML: rewrites qualifying `href` targets to
 * signed /api/digest/click redirects and appends the /api/digest/open pixel.
 * Runs after `renderDigest` so the template stays untouched by tracking.
 */
export async function instrumentDigestHtml(
  html: string,
  input: InstrumentDigestHtmlInput,
): Promise<string> {
  const siteUrl = input.siteUrl.replace(/\/+$/, '')
  const hrefPattern = /href="([^"]+)"/g
  const rewrites = new Map<string, string>()
  for (const match of html.matchAll(hrefPattern)) {
    const raw = match[1]!
    if (rewrites.has(raw))
      continue
    const url = decodeHtmlAttribute(raw)
    if (!shouldWrapHref(url))
      continue
    const token = await signDigestEventToken(
      { runId: input.runId, event: 'click', url },
      input.secret,
      input.now,
    )
    rewrites.set(raw, `${siteUrl}/api/digest/click?t=${encodeURIComponent(token)}`)
  }
  const wrapped = html.replace(hrefPattern, (full, raw: string) => {
    const target = rewrites.get(raw)
    return target ? `href="${target}"` : full
  })

  const openToken = await signDigestEventToken(
    { runId: input.runId, event: 'open' },
    input.secret,
    input.now,
  )
  const pixelUrl = `${siteUrl}/api/digest/open?t=${encodeURIComponent(openToken)}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">`
  return /<\/body>/i.test(wrapped)
    ? wrapped.replace(/<\/body>/i, `${pixel}</body>`)
    : `${wrapped}${pixel}`
}

// --- Event recording ------------------------------------------------------

export type RecordDigestEventInput
  = { runId: number, event: 'open', occurredAt: number }
    | { runId: number, event: 'click', linkKey: string, url: string, occurredAt: number }

/**
 * Records one tracking event. The guarded INSERT no-ops when the digest run
 * no longer exists (deleted user cascade, forged-but-valid-looking id), so
 * the pixel/redirect routes never surface an error to the mail client.
 */
export async function recordDigestEvent(
  db: D1Database,
  input: RecordDigestEventInput,
): Promise<boolean> {
  const result = await db.prepare(
    `INSERT INTO digest_email_events (run_id, event, link_key, url, occurred_at)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE EXISTS (SELECT 1 FROM digest_runs WHERE id = ?1)`,
  ).bind(
    input.runId,
    input.event,
    input.event === 'click' ? input.linkKey : null,
    input.event === 'click' ? input.url : null,
    input.occurredAt,
  ).run()
  return (result.meta?.changes ?? 0) > 0
}

// --- Metrics --------------------------------------------------------------

export interface DigestLinkMetrics {
  linkKey: string
  url: string
  clicks: number
}

export interface DigestRunMetrics {
  runId: number
  opens: number
  clicks: number
  firstOpenAt: number | null
  lastEventAt: number | null
  links: DigestLinkMetrics[]
}

export async function digestRunMetrics(
  db: D1Database,
  runId: number,
): Promise<DigestRunMetrics> {
  const totals = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN event = 'open' THEN 1 ELSE 0 END), 0) AS opens,
       COALESCE(SUM(CASE WHEN event = 'click' THEN 1 ELSE 0 END), 0) AS clicks,
       MIN(CASE WHEN event = 'open' THEN occurred_at END) AS first_open_at,
       MAX(occurred_at) AS last_event_at
     FROM digest_email_events
     WHERE run_id = ?1`,
  ).bind(runId).first<{
    opens: number
    clicks: number
    first_open_at: number | null
    last_event_at: number | null
  }>()
  const links = await db.prepare(
    `SELECT link_key, url, COUNT(*) AS clicks
     FROM digest_email_events
     WHERE run_id = ?1 AND event = 'click'
     GROUP BY link_key, url
     ORDER BY clicks DESC, link_key ASC`,
  ).bind(runId).all<{ link_key: string, url: string, clicks: number }>()
  return {
    runId,
    opens: totals?.opens ?? 0,
    clicks: totals?.clicks ?? 0,
    firstOpenAt: totals?.first_open_at ?? null,
    lastEventAt: totals?.last_event_at ?? null,
    links: (links.results ?? []).map(row => ({
      linkKey: row.link_key,
      url: row.url,
      clicks: row.clicks,
    })),
  }
}

export interface DigestRunEngagementRow {
  runId: number
  userId: number
  deliveryKey: string
  sentAt: number | null
  changeCount: number
  opens: number
  clicks: number
}

/** Recent sent digest runs with per-run open/click counts, newest first. */
export async function listDigestRunEngagement(
  db: D1Database,
  input: { limit?: number } = {},
): Promise<DigestRunEngagementRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const rows = await db.prepare(
    `SELECT r.id AS run_id, r.user_id, r.delivery_key, r.sent_at, r.change_count,
       COALESCE(SUM(CASE WHEN e.event = 'open' THEN 1 ELSE 0 END), 0) AS opens,
       COALESCE(SUM(CASE WHEN e.event = 'click' THEN 1 ELSE 0 END), 0) AS clicks
     FROM digest_runs r
     LEFT JOIN digest_email_events e ON e.run_id = r.id
     WHERE r.status = 'sent'
     GROUP BY r.id
     ORDER BY r.sent_at DESC
     LIMIT ?1`,
  ).bind(limit).all<{
    run_id: number
    user_id: number
    delivery_key: string
    sent_at: number | null
    change_count: number
    opens: number
    clicks: number
  }>()
  return (rows.results ?? []).map(row => ({
    runId: row.run_id,
    userId: row.user_id,
    deliveryKey: row.delivery_key,
    sentAt: row.sent_at,
    changeCount: row.change_count,
    opens: row.opens,
    clicks: row.clicks,
  }))
}
