import { CLUSTER_BY_SLUG } from '../../layers/registry/server/data/clusters'

export interface SmokeExpectation {
  path: string
  status: number
  location?: string
  /**
   * Substrings the response body must contain.
   *
   * A 200 only proves the Worker answered, not that it rendered anything. On
   * 2026-08-12 every `/skills/<category>` page served a 200 with the data
   * embedded in the Nuxt payload but no `<h1>` and a fallback `<title>`,
   * because the page fetched without awaiting and Vue rendered before the
   * request settled. Three deploys passed this smoke check with the entire
   * category surface blank to crawlers.
   *
   * Assert on markup the page cannot render without its data.
   */
  bodyContains?: string[]
}

export interface SmokeObservation {
  status: number
  location: string | null
  body?: string
}

export type SmokeEvaluation
  = | { _tag: 'passed' }
    | {
      _tag: 'failed'
      reason: 'status_mismatch' | 'location_mismatch' | 'network_error' | 'asset_manifest_empty' | 'content_missing'
      expected: string
      actual: string
    }

export type SmokeFetch = (input: string, init: RequestInit) => Promise<Response>

export interface ProductionSmokeDependencies {
  baseUrl: string
  attempts?: number
  retryDelayMs?: number
  /**
   * `cloudflare-cdn-cache-control: max-age=60` on `/_nuxt/v2/**` (see routeRules
   * in nuxt.config) pins a rollout 404 at the edge even once origin serves the
   * asset. Keep this in step with that max-age.
   */
  cdnCacheTtlMs?: number
  /**
   * Asset coherence gets a longer budget than the page checks. Assets are served
   * by the per-version ASSETS binding, so mid-rollout the HTML can come from the
   * new version while an asset request still lands on the old one and 404s. That
   * window has outlasted the page budget in production (runs 30365494042 and
   * 30782222458), and rolling back does not shorten it, since the rollback is
   * itself another version switch.
   */
  assetCoherenceAttempts?: number
  expectations?: SmokeExpectation[]
  fetch?: SmokeFetch
  wait?: (milliseconds: number) => Promise<void>
}

/**
 * A stale edge entry clears within one TTL. Two waits bound the deploy while
 * still proving that a clean-URL 404 outliving the cache is a real fault.
 */
const MAX_STALE_CACHE_WAITS = 2

export type ProductionSmokeResult
  = | {
    _tag: 'passed'
    checks: Array<{ path: string, attempts: number }>
  }
  | {
    _tag: 'failed'
    failures: Array<{
      path: string
      attempts: number
      result: Extract<SmokeEvaluation, { _tag: 'failed' }>
    }>
  }

export const PRODUCTION_SMOKE_EXPECTATIONS: SmokeExpectation[] = [
  { path: '/', status: 200, bodyContains: ['<h1'] },
  { path: '/skills', status: 200, bodyContains: ['<h1'] },
  { path: '/community', status: 200, bodyContains: ['<h1'] },
  { path: '/collections', status: 301, location: '/community' },
  { path: '/guides', status: 410 },
  { path: '/guides/npm/example', status: 410 },
  { path: '/skills/leaderboard', status: 200 },
  { path: '/skills/not-a-real-outcome', status: 404 },
  { path: '/collections/_CollectionAvatar', status: 404 },
  // The `plan` cluster became `planning` in the 2026-08-12 category rework, so
  // the tag redirect points at the new slug. The old slug is itself a 301 now,
  // and a redirect chain would be the bug this check exists to catch.
  { path: '/skills/tag/plan', status: 301, location: '/skills/planning' },
  { path: '/skills/plan', status: 301, location: '/skills/planning' },
  // The category surface is the reason the rework exists, so it is checked for
  // rendered content, not just a 200.
  //
  // `<h1` alone is not enough here: the page's error branch renders an h1 too,
  // so an API failure would pass. The keyword title only appears when the
  // server actually resolved the category, which is the thing under test.
  //
  // Read from CLUSTER_BY_SLUG rather than pasted in. A literal would mean
  // editing this category's copy silently fails the smoke check and rolls back
  // the deploy, which is a trap for whoever edits the copy months from now.
  {
    path: '/skills/seo',
    status: 200,
    bodyContains: ['<h1', CLUSTER_BY_SLUG.get('seo')!.seoTitle],
  },
  { path: '/skills/tag/cloudflare', status: 200, bodyContains: ['<h1'] },
]

export function evaluateSmokeObservation(
  expectation: SmokeExpectation,
  observation: SmokeObservation,
): SmokeEvaluation {
  if (observation.status !== expectation.status) {
    return {
      _tag: 'failed',
      reason: 'status_mismatch',
      expected: String(expectation.status),
      actual: String(observation.status),
    }
  }
  if (expectation.location !== undefined && observation.location !== expectation.location) {
    return {
      _tag: 'failed',
      reason: 'location_mismatch',
      expected: expectation.location,
      actual: observation.location ?? 'missing',
    }
  }
  for (const fragment of expectation.bodyContains ?? []) {
    if (!(observation.body ?? '').includes(fragment)) {
      return {
        _tag: 'failed',
        reason: 'content_missing',
        expected: fragment,
        actual: observation.body === undefined ? 'body not read' : 'absent from body',
      }
    }
  }
  return { _tag: 'passed' }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function observe(
  fetch: SmokeFetch,
  baseUrl: string,
  path: string,
): Promise<
  | SmokeObservation & { body: string, contentType: string | null }
  | Extract<SmokeEvaluation, { _tag: 'failed' }>
> {
  return fetch(new URL(path, baseUrl).toString(), {
    redirect: 'manual',
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'skilld-production-smoke/1',
    },
  }).then(async response => ({
    status: response.status,
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    body: await response.text(),
  })).catch((error: unknown) => ({
    _tag: 'failed' as const,
    reason: 'network_error' as const,
    expected: 'response',
    actual: errorMessage(error),
  }))
}

function extractNuxtAssets(html: string): string[] {
  const assets = new Set<string>()
  const tags = html.matchAll(/<(?:script|link)\b[^>]*>/gi)
  for (const match of tags) {
    const source = match[0].match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1]
    if (source && /^\/_nuxt\/v2\/[^?#]+\.(?:css|js)$/.test(source))
      assets.add(source)
  }
  return [...assets]
}

async function checkWithRetries(
  dependencies: ProductionSmokeDependencies,
  input: {
    fetch: SmokeFetch
    attempts: number
    retryDelayMs: number
    wait: (milliseconds: number) => Promise<void>
    requestPath: string
    reportPath: string
  },
): Promise<
  | { _tag: 'passed', path: string, attempts: number }
  | {
    _tag: 'failed'
    path: string
    attempts: number
    result: Extract<SmokeEvaluation, { _tag: 'failed' }>
  }
> {
  let latestFailure: Extract<SmokeEvaluation, { _tag: 'failed' }> | null = null
  for (let attempt = 1; attempt <= input.attempts; attempt++) {
    const observation = await observe(input.fetch, dependencies.baseUrl, input.requestPath)
    const evaluation = '_tag' in observation
      ? observation
      : evaluateSmokeObservation(
          { path: input.reportPath, status: 200 },
          observation,
        )
    if (evaluation._tag === 'passed')
      return { _tag: 'passed', path: input.reportPath, attempts: attempt }
    latestFailure = evaluation
    if (attempt < input.attempts)
      await input.wait(input.retryDelayMs)
  }
  return {
    _tag: 'failed',
    path: input.reportPath,
    attempts: input.attempts,
    result: latestFailure!,
  }
}

async function checkLeaderboardAssetCoherence(
  dependencies: ProductionSmokeDependencies,
  input: {
    fetch: SmokeFetch
    attempts: number
    retryDelayMs: number
    cdnCacheTtlMs: number
    wait: (milliseconds: number) => Promise<void>
  },
): Promise<
  | { _tag: 'passed' }
  | {
    _tag: 'failed'
    failures: Array<{
      path: string
      attempts: number
      result: Extract<SmokeEvaluation, { _tag: 'failed' }>
    }>
  }
> {
  let latestFailures: Array<{
    path: string
    attempts: number
    result: Extract<SmokeEvaluation, { _tag: 'failed' }>
  }> = []
  let staleCacheWaits = 0

  for (let attempt = 1; attempt <= input.attempts; attempt++) {
    let nextDelayMs = input.retryDelayMs
    const page = await observe(input.fetch, dependencies.baseUrl, '/skills/leaderboard')
    if ('_tag' in page) {
      latestFailures = [{
        path: '/skills/leaderboard',
        attempts: attempt,
        result: page,
      }]
    }
    else {
      const pageEvaluation = evaluateSmokeObservation(
        { path: '/skills/leaderboard', status: 200 },
        page,
      )
      if (pageEvaluation._tag === 'failed') {
        latestFailures = [{
          path: '/skills/leaderboard',
          attempts: attempt,
          result: pageEvaluation,
        }]
      }
      else {
        const assets = page.contentType?.includes('text/html')
          ? extractNuxtAssets(page.body)
          : []
        if (assets.length === 0) {
          latestFailures = [{
            path: '/skills/leaderboard',
            attempts: attempt,
            result: {
              _tag: 'failed',
              reason: 'asset_manifest_empty',
              expected: 'Nuxt assets',
              actual: 'none',
            },
          }]
        }
        else {
          const probeToken = `${Date.now()}-${attempt}`
          const readinessResults = await Promise.all(assets.map(reportPath =>
            checkWithRetries(dependencies, {
              fetch: input.fetch,
              attempts: 1,
              retryDelayMs: 0,
              wait: input.wait,
              requestPath: `${reportPath}?production-smoke=${probeToken}`,
              reportPath,
            }),
          ))
          const readinessFailures = readinessResults.filter(result => result._tag === 'failed')
          if (readinessFailures.length === 0) {
            const cleanResults = await Promise.all(assets.map(requestPath =>
              checkWithRetries(dependencies, {
                fetch: input.fetch,
                attempts: 1,
                retryDelayMs: 0,
                wait: input.wait,
                requestPath,
                reportPath: requestPath,
              }),
            ))
            const cleanFailures = cleanResults.filter(result => result._tag === 'failed')
            if (cleanFailures.length === 0)
              return { _tag: 'passed' }
            // Origin serves every asset, so a clean-URL failure is an edge entry
            // cached before the smoke began. Outwait the TTL rather than spending
            // the retry budget inside it.
            if (staleCacheWaits < MAX_STALE_CACHE_WAITS) {
              nextDelayMs = input.cdnCacheTtlMs
              staleCacheWaits++
            }
            latestFailures = cleanFailures.map(failure => ({
              path: failure.path,
              attempts: attempt,
              result: failure.result,
            }))
          }
          else {
            latestFailures = readinessFailures.map(failure => ({
              path: failure.path,
              attempts: attempt,
              result: failure.result,
            }))
          }
        }
      }
    }

    if (attempt < input.attempts)
      await input.wait(nextDelayMs)
  }

  return {
    _tag: 'failed',
    failures: latestFailures,
  }
}

export async function runProductionSmoke(
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeResult> {
  const attempts = Math.max(1, Math.floor(dependencies.attempts ?? 12))
  const retryDelayMs = Math.max(0, Math.floor(dependencies.retryDelayMs ?? 5_000))
  const cdnCacheTtlMs = Math.max(0, Math.floor(dependencies.cdnCacheTtlMs ?? 60_000))
  const assetCoherenceAttempts = Math.max(
    attempts,
    Math.floor(dependencies.assetCoherenceAttempts ?? 48),
  )
  const expectations = dependencies.expectations ?? PRODUCTION_SMOKE_EXPECTATIONS
  const fetch = dependencies.fetch ?? globalThis.fetch
  const wait = dependencies.wait ?? waitFor

  const results = await Promise.all(expectations.map(async (expectation) => {
    let latestFailure: Extract<SmokeEvaluation, { _tag: 'failed' }> | null = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const observation = await observe(fetch, dependencies.baseUrl, expectation.path)
      const evaluation = '_tag' in observation
        ? observation
        : evaluateSmokeObservation(expectation, observation)
      if (evaluation._tag === 'passed') {
        return {
          _tag: 'passed' as const,
          path: expectation.path,
          attempts: attempt,
        }
      }
      latestFailure = evaluation
      if (attempt < attempts)
        await wait(retryDelayMs)
    }
    return {
      _tag: 'failed' as const,
      path: expectation.path,
      attempts,
      result: latestFailure!,
    }
  }))

  const failures = results.filter(result => result._tag === 'failed')
  if (failures.length) {
    return {
      _tag: 'failed',
      failures: failures.map(failure => ({
        path: failure.path,
        attempts: failure.attempts,
        result: failure.result,
      })),
    }
  }

  if (expectations.some(expectation => expectation.path === '/skills/leaderboard')) {
    const coherence = await checkLeaderboardAssetCoherence(dependencies, {
      fetch,
      attempts: assetCoherenceAttempts,
      retryDelayMs,
      cdnCacheTtlMs,
      wait,
    })
    if (coherence._tag === 'failed')
      return coherence
  }

  return {
    _tag: 'passed',
    checks: results.map(result => ({ path: result.path, attempts: result.attempts })),
  }
}
