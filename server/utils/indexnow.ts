/// <reference types="@cloudflare/workers-types" />

/**
 * IndexNow, scoped so a flood is impossible by construction.
 *
 * The 2026-07 outage came from submitting the whole catalog (424k submissions
 * for 143k pages) until the endpoint answered 429 for eight days. This module
 * cannot repeat that, whatever the caller passes in:
 * - The candidate list is the curated sitemap set, never a table scan.
 * - A URL is a candidate only if it is new or its fingerprint (sitemap
 *   `lastmod`) moved since the last accepted submission.
 * - One run sends one request of at most `INDEXNOW_RUN_CAP` URLs. It starts
 *   only if the last 24 hours hold fewer than `INDEXNOW_DAY_CAP` URLs.
 * - The ledger row and a pending strike are written BEFORE the POST, then
 *   settled after it. A network error, a D1 failure after an accepted POST, or
 *   a crash therefore still counts against the caps and still adds a strike.
 *   If the pre-write fails, nothing is sent.
 * - A 429 or 5xx stores a retry time. Three strikes halt the task with a
 *   reason. `Retry-After` is honoured up to `INDEXNOW_MAX_RETRY_AFTER_SECONDS`.
 * - A 400 or 422 halves the next request, so one bad URL is isolated and
 *   skipped instead of blocking the queue.
 */

export const INDEXNOW_KEY = '6b32d2ab96625fcba8a5535e84c72ba3'
export const INDEXNOW_HOST = 'skilld.dev'
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** The IndexNow protocol accepts at most 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS_PER_REQUEST = 10_000
export const INDEXNOW_RUN_CAP = 200
export const INDEXNOW_DAY_CAP = 1000
/** Consecutive failures before the task halts. */
export const INDEXNOW_MAX_STRIKES = 3
export const INDEXNOW_HALT_SECONDS = 24 * 60 * 60
/** The longest wait a `Retry-After` header can impose, on a backoff or a halt. */
export const INDEXNOW_MAX_RETRY_AFTER_SECONDS = 7 * 24 * 60 * 60
/** Response bodies are kept in logs and halt reasons only up to this length. */
export const INDEXNOW_BODY_LOG_LENGTH = 200
/** Backoff when the response carries no usable Retry-After, by strike count. */
export const INDEXNOW_BACKOFF_SECONDS = [15 * 60, 30 * 60, 60 * 60] as const
export const INDEXNOW_BATCH_RETENTION_SECONDS = 7 * 24 * 60 * 60

const CURATED_SITEMAP = /^\/__sitemap__\/(?:pages|authors|sources|skills(?:-\d+)?)\.xml$/

export interface IndexNowCandidate {
  url: string
  /** Sitemap `lastmod`, or empty when the sitemap gives none. */
  fingerprint: string
}

// Sitemap parsing

/** Child sitemap URLs of the curated set, from a sitemap index. */
export function curatedSitemapUrls(indexXml: string, host = INDEXNOW_HOST): string[] {
  return extractTagValues(indexXml, 'loc').filter((loc) => {
    const url = parseUrl(loc)
    return url !== null && url.host === host && CURATED_SITEMAP.test(url.pathname)
  })
}

/** Page URLs of one sitemap, on the IndexNow host only. */
export function parseSitemapCandidates(xml: string, host = INDEXNOW_HOST): IndexNowCandidate[] {
  const candidates: IndexNowCandidate[] = []
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = extractTagValues(block, 'loc')[0]
    if (!loc)
      continue
    const url = parseUrl(loc)
    if (url === null || url.host !== host)
      continue
    candidates.push({ url: loc, fingerprint: extractTagValues(block, 'lastmod')[0] ?? '' })
  }
  return candidates
}

function extractTagValues(xml: string, tag: string): string[] {
  const values: string[] = []
  const pattern = new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, 'g')
  for (const match of xml.matchAll(pattern)) {
    const value = decodeXmlEntities(match[1] ?? '')
    if (value)
      values.push(value)
  }
  return values
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', '\'')
    .replaceAll('&amp;', '&')
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  }
  catch {
    return null
  }
}

// Selection

export interface SubmissionBudgetInput {
  runCap: number
  dayCap: number
  submittedLastDay: number
}

export function submissionBudget(input: SubmissionBudgetInput): number {
  return Math.max(0, Math.min(input.runCap, input.dayCap - input.submittedLastDay))
}

export interface SubmissionPlan {
  /** New URLs first, then changed URLs, each group sorted by URL. */
  selected: IndexNowCandidate[]
  /** Eligible URLs left for a later run. */
  deferred: number
}

/**
 * Pick what to submit. A URL is eligible when it is new, or when it has a
 * fingerprint that differs from the accepted one. A URL without a fingerprint
 * never counts as changed, because there is no signal to compare.
 */
export function planSubmission(
  candidates: readonly IndexNowCandidate[],
  accepted: ReadonlyMap<string, string>,
  budget: number,
): SubmissionPlan {
  const fresh: IndexNowCandidate[] = []
  const changed: IndexNowCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.url))
      continue
    seen.add(candidate.url)
    const previous = accepted.get(candidate.url)
    if (previous === undefined)
      fresh.push(candidate)
    else if (candidate.fingerprint !== '' && candidate.fingerprint !== previous)
      changed.push(candidate)
  }
  const byUrl = (a: IndexNowCandidate, b: IndexNowCandidate) => a.url.localeCompare(b.url)
  const eligible = [...fresh.sort(byUrl), ...changed.sort(byUrl)]
  return { selected: eligible.slice(0, budget), deferred: Math.max(0, eligible.length - budget) }
}

export function chunkUrls<T>(items: readonly T[], size = INDEXNOW_MAX_URLS_PER_REQUEST): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size))
  return chunks
}

// Backoff

export interface IndexNowState {
  strikes: number
  /** Epoch seconds. The task submits nothing before this time. */
  notBefore: number
  /** Set when the task halted instead of backing off. */
  haltReason: string | null
}

export const INDEXNOW_INITIAL_STATE: IndexNowState = { strikes: 0, notBefore: 0, haltReason: null }

export type IndexNowGate
  = | { _tag: 'open' }
    | { _tag: 'closed', notBefore: number, reason: string }

export function gateFor(state: IndexNowState, now: number): IndexNowGate {
  if (now >= state.notBefore)
    return { _tag: 'open' }
  return {
    _tag: 'closed',
    notBefore: state.notBefore,
    reason: state.haltReason ?? `backing off after ${state.strikes} failed request${state.strikes === 1 ? '' : 's'}`,
  }
}

export type IndexNowOutcome
  = | { _tag: 'accepted', status: number }
    | { _tag: 'backoff', status: number, retryAfterSeconds: number | null, detail?: string }
    /** The request threw: network error, timeout, DNS. */
    | { _tag: 'error', detail: string }
    /** `splittable` marks 400 and 422, where one bad URL can cause the answer. */
    | { _tag: 'rejected', status: number, detail: string, splittable?: boolean }

/** Read a Retry-After header: delta seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null)
    return null
  const value = header.trim()
  if (/^\d+$/.test(value))
    return Number(value)
  const date = Date.parse(value)
  if (Number.isNaN(date))
    return null
  return Math.max(0, Math.ceil(date / 1000) - now)
}

export function truncateBody(body: string, length = INDEXNOW_BODY_LOG_LENGTH): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length)}...` : flat
}

/**
 * 200 and 202 are success. 429 and 5xx are transient. Any other status means
 * the request itself is wrong (bad key, key file missing, invalid URLs), and
 * repeating it cannot help. `body` is the response text, kept short for logs.
 */
export function classifyResponse(
  status: number,
  retryAfterHeader: string | null,
  now: number,
  body = '',
): IndexNowOutcome {
  if (status === 200 || status === 202)
    return { _tag: 'accepted', status }
  const excerpt = truncateBody(body)
  if (status === 429 || status >= 500) {
    return {
      _tag: 'backoff',
      status,
      retryAfterSeconds: parseRetryAfter(retryAfterHeader, now),
      ...(excerpt ? { detail: excerpt } : {}),
    }
  }
  return {
    _tag: 'rejected',
    status,
    detail: `IndexNow rejected the request with HTTP ${status}${excerpt ? `: ${excerpt}` : ''}`,
    splittable: status === 400 || status === 422,
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.ceil(seconds / 3600)
  return hours <= 48 ? `${hours} hours` : `${Math.ceil(hours / 24)} days`
}

function failureLabel(outcome: Extract<IndexNowOutcome, { _tag: 'backoff' | 'error' }>): string {
  if (outcome._tag === 'error')
    return `request failed: ${outcome.detail}`
  return `HTTP ${outcome.status}${outcome.detail ? `: ${outcome.detail}` : ''}`
}

/** The next stored state after one request. Pure, so the schedule is testable. */
export function applyOutcome(state: IndexNowState, outcome: IndexNowOutcome, now: number): IndexNowState {
  if (outcome._tag === 'accepted')
    return INDEXNOW_INITIAL_STATE
  if (outcome._tag === 'rejected') {
    return {
      strikes: INDEXNOW_MAX_STRIKES,
      notBefore: now + INDEXNOW_HALT_SECONDS,
      haltReason: `${outcome.detail}; halted for 24 hours`,
    }
  }
  const strikes = state.strikes + 1
  const retryAfter = outcome._tag === 'backoff' ? outcome.retryAfterSeconds : null
  const advised = Math.min(INDEXNOW_MAX_RETRY_AFTER_SECONDS, retryAfter ?? 0)
  if (strikes >= INDEXNOW_MAX_STRIKES) {
    const wait = Math.max(INDEXNOW_HALT_SECONDS, advised)
    const honoured = advised > INDEXNOW_HALT_SECONDS ? `, honouring Retry-After of ${retryAfter} seconds${retryAfter! > advised ? ` (capped at ${formatDuration(advised)})` : ''}` : ''
    return {
      strikes,
      notBefore: now + wait,
      haltReason: `${failureLabel(outcome)} on ${strikes} requests in a row; halted for ${formatDuration(wait)}${honoured}`,
    }
  }
  const scheduled = INDEXNOW_BACKOFF_SECONDS[Math.min(strikes, INDEXNOW_BACKOFF_SECONDS.length) - 1]!
  return { strikes, notBefore: now + Math.max(scheduled, advised), haltReason: null }
}

// Effects

export interface IndexNowDeps {
  db: D1Database
  /** Reaches this site's own pages: the SELF binding in production. */
  selfFetch: (url: string) => Promise<Response>
  /** Reaches the IndexNow endpoint. */
  send: typeof fetch
  now: () => number
}

export type IndexNowRun
  = | { _tag: 'closed', notBefore: number, reason: string }
    | { _tag: 'key-unreachable', reason: string }
    | { _tag: 'sitemap-failed', reason: string }
    | { _tag: 'idle', candidates: number }
    | { _tag: 'over-budget', deferred: number }
    | { _tag: 'submitted', submitted: number, deferred: number }
    /** One URL alone drew a 400 or 422. It is skipped until its fingerprint moves. */
    | { _tag: 'skipped', url: string, detail: string, state: IndexNowState }
    | { _tag: 'failed', submitted: number, outcome: Exclude<IndexNowOutcome, { _tag: 'accepted' }>, state: IndexNowState }

/** Whether a run needs an operator's attention in the job report. */
export function runNeedsAttention(run: IndexNowRun): string | null {
  switch (run._tag) {
    case 'closed':
      return run.reason
    case 'key-unreachable':
    case 'sitemap-failed':
      return run.reason
    case 'skipped':
      return `${run.state.haltReason ?? run.detail}; skipped ${run.url}`
    case 'failed':
      if (run.state.haltReason !== null)
        return run.state.haltReason
      if (run.outcome._tag === 'rejected')
        return `${run.outcome.detail}; the next request sends half the batch`
      return run.outcome._tag === 'error' ? `request failed: ${run.outcome.detail}; backing off` : `IndexNow answered HTTP ${run.outcome.status}; backing off`
    default:
      return null
  }
}

async function readState(db: D1Database): Promise<IndexNowState> {
  const row = await db
    .prepare('SELECT strikes, not_before, halt_reason FROM indexnow_state WHERE id = 1')
    .first<{ strikes: number, not_before: number, halt_reason: string | null }>()
  if (!row)
    return INDEXNOW_INITIAL_STATE
  return { strikes: row.strikes, notBefore: row.not_before, haltReason: row.halt_reason }
}

async function loadCandidates(deps: IndexNowDeps): Promise<{ _tag: 'ok', candidates: IndexNowCandidate[] } | { _tag: 'err', reason: string }> {
  const indexResponse = await deps.selfFetch(`https://${INDEXNOW_HOST}/sitemap_index.xml`)
  if (!indexResponse.ok)
    return { _tag: 'err', reason: `sitemap index answered HTTP ${indexResponse.status}` }
  const children = curatedSitemapUrls(await indexResponse.text())
  if (children.length === 0)
    return { _tag: 'err', reason: 'sitemap index lists no curated sitemap' }
  const candidates: IndexNowCandidate[] = []
  for (const child of children) {
    const response = await deps.selfFetch(child)
    if (!response.ok)
      return { _tag: 'err', reason: `${child} answered HTTP ${response.status}` }
    candidates.push(...parseSitemapCandidates(await response.text()))
  }
  return { _tag: 'ok', candidates }
}

async function keyFileIsReachable(deps: IndexNowDeps): Promise<string | null> {
  const response = await deps.selfFetch(INDEXNOW_KEY_LOCATION)
  if (!response.ok)
    return `key file ${INDEXNOW_KEY_LOCATION} answered HTTP ${response.status}`
  const body = (await response.text()).trim()
  return body === INDEXNOW_KEY ? null : `key file ${INDEXNOW_KEY_LOCATION} does not contain the key`
}

async function loadAccepted(db: D1Database): Promise<Map<string, string>> {
  const { results } = await db.prepare('SELECT url, fingerprint FROM indexnow_urls').all<{ url: string, fingerprint: string }>()
  return new Map((results ?? []).map(row => [row.url, row.fingerprint]))
}

function upsertUrl(db: D1Database, candidate: IndexNowCandidate, now: number) {
  return db
    .prepare(`INSERT INTO indexnow_urls (url, fingerprint, submitted_at) VALUES (?1, ?2, ?3)
      ON CONFLICT(url) DO UPDATE SET fingerprint = ?2, submitted_at = ?3`)
    .bind(candidate.url, candidate.fingerprint, now)
}

function stateStatement(db: D1Database, state: IndexNowState, now: number) {
  return db
    .prepare(`INSERT INTO indexnow_state (id, strikes, not_before, halt_reason, updated_at)
      VALUES (1, ?1, ?2, ?3, ?4)
      ON CONFLICT(id) DO UPDATE SET strikes = ?1, not_before = ?2, halt_reason = ?3, updated_at = ?4`)
    .bind(state.strikes, state.notBefore, state.haltReason, now)
}

/**
 * Write the ledger row and the pending state in one transaction, before the
 * POST. The row starts with status 0 ("sent, no answer recorded"). If nothing
 * settles it, the URLs still count against the caps and the strike stays.
 */
async function recordAttempt(db: D1Database, urlCount: number, pending: IndexNowState, now: number): Promise<number> {
  const [ledger] = await db.batch([
    db.prepare('INSERT INTO indexnow_batches (submitted_at, url_count, http_status) VALUES (?1, ?2, 0)').bind(now, urlCount),
    stateStatement(db, pending, now),
  ])
  return ledger!.meta.last_row_id
}

/** Settle one attempt: its status, the URLs it moved, and the state to store. */
async function settleAttempt(
  db: D1Database,
  attempt: { id: number, status: number, urls: readonly IndexNowCandidate[], state: IndexNowState },
  now: number,
): Promise<void> {
  const statements = attempt.urls.map(candidate => upsertUrl(db, candidate, now))
  // D1 runs one batch as one transaction; 50 statements stays well under its limits.
  const groups = chunkUrls(statements, 50)
  for (const group of groups)
    await db.batch(group)
  await db.batch([
    db.prepare('UPDATE indexnow_batches SET http_status = ?1 WHERE id = ?2').bind(attempt.status, attempt.id),
    stateStatement(db, attempt.state, now),
  ])
}

async function readProbeLimit(db: D1Database): Promise<number | null> {
  const last = await db
    .prepare('SELECT url_count, http_status FROM indexnow_batches ORDER BY id DESC LIMIT 1')
    .first<{ url_count: number, http_status: number }>()
  if (last && (last.http_status === 400 || last.http_status === 422))
    return Math.max(1, Math.floor(last.url_count / 2))
  return null
}

async function post(deps: IndexNowDeps, batch: readonly IndexNowCandidate[], now: number): Promise<IndexNowOutcome> {
  try {
    const response = await deps.send(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList: batch.map(candidate => candidate.url),
      }),
    })
    // A body that cannot be read only loses the log excerpt; the status decides.
    const body = await response.text().catch(() => '')
    return classifyResponse(response.status, response.headers.get('retry-after'), now, body)
  }
  catch (error) {
    return { _tag: 'error', detail: truncateBody(error instanceof Error ? error.message : String(error)) }
  }
}

/**
 * One scheduled run. Order matters: the stored gate is checked before any
 * network call, and the attempt is recorded before the POST.
 */
export async function runIndexNow(deps: IndexNowDeps): Promise<IndexNowRun> {
  const now = deps.now()
  const state = await readState(deps.db)
  const gate = gateFor(state, now)
  if (gate._tag === 'closed')
    return { _tag: 'closed', notBefore: gate.notBefore, reason: gate.reason }

  const keyProblem = await keyFileIsReachable(deps)
  if (keyProblem !== null)
    return { _tag: 'key-unreachable', reason: keyProblem }

  const loaded = await loadCandidates(deps)
  if (loaded._tag === 'err')
    return { _tag: 'sitemap-failed', reason: loaded.reason }

  await deps.db
    .prepare('DELETE FROM indexnow_batches WHERE submitted_at < ?1')
    .bind(now - INDEXNOW_BATCH_RETENTION_SECONDS)
    .run()
  const dayStart = now - 24 * 60 * 60
  const submittedRow = await deps.db
    .prepare('SELECT COALESCE(SUM(url_count), 0) AS total FROM indexnow_batches WHERE submitted_at >= ?1')
    .bind(dayStart)
    .first<{ total: number }>()
  const probeLimit = await readProbeLimit(deps.db)
  const budget = submissionBudget({
    runCap: Math.min(INDEXNOW_RUN_CAP, probeLimit ?? INDEXNOW_RUN_CAP),
    dayCap: INDEXNOW_DAY_CAP,
    submittedLastDay: submittedRow?.total ?? 0,
  })
  const plan = planSubmission(loaded.candidates, await loadAccepted(deps.db), budget)
  if (plan.selected.length === 0)
    return plan.deferred > 0 ? { _tag: 'over-budget', deferred: plan.deferred } : { _tag: 'idle', candidates: loaded.candidates.length }

  let submitted = 0
  let current = state
  for (const batch of chunkUrls(plan.selected)) {
    const pending = applyOutcome(current, { _tag: 'error', detail: 'the attempt never settled' }, now)
    const id = await recordAttempt(deps.db, batch.length, pending, now)
    const outcome = await post(deps, batch, now)

    if (outcome._tag === 'accepted') {
      current = INDEXNOW_INITIAL_STATE
      await settleAttempt(deps.db, { id, status: outcome.status, urls: batch, state: current }, now)
      submitted += batch.length
      continue
    }

    const status = 'status' in outcome ? outcome.status : 0
    if (outcome._tag === 'rejected' && outcome.splittable === true) {
      // A 400 or 422 may name one bad URL. Halve the next request until one
      // URL stands alone, then skip it, so it cannot block the queue.
      if (batch.length > 1) {
        current = { ...current, notBefore: 0, haltReason: null }
        await settleAttempt(deps.db, { id, status, urls: [], state: current }, now)
        return { _tag: 'failed', submitted, outcome, state: current }
      }
      const strikes = current.strikes + 1
      current = strikes >= INDEXNOW_MAX_STRIKES
        ? applyOutcome(current, outcome, now)
        : { strikes, notBefore: 0, haltReason: null }
      await settleAttempt(deps.db, { id, status, urls: batch, state: current }, now)
      return { _tag: 'skipped', url: batch[0]!.url, detail: outcome.detail, state: current }
    }

    current = applyOutcome(current, outcome, now)
    await settleAttempt(deps.db, { id, status, urls: [], state: current }, now)
    return { _tag: 'failed', submitted, outcome, state: current }
  }

  return { _tag: 'submitted', submitted, deferred: plan.deferred }
}
