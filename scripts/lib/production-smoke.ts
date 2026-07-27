export interface SmokeExpectation {
  path: string
  status: number
  location?: string
}

export interface SmokeObservation {
  status: number
  location: string | null
}

export type SmokeEvaluation
  = | { _tag: 'passed' }
    | {
      _tag: 'failed'
      reason: 'status_mismatch' | 'location_mismatch' | 'network_error'
      expected: string
      actual: string
    }

export type SmokeFetch = (input: string, init: RequestInit) => Promise<Response>

export interface ProductionSmokeDependencies {
  baseUrl: string
  attempts?: number
  retryDelayMs?: number
  expectations?: SmokeExpectation[]
  fetch?: SmokeFetch
  wait?: (milliseconds: number) => Promise<void>
}

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
  { path: '/', status: 200 },
  { path: '/skills', status: 200 },
  { path: '/collections', status: 200 },
  { path: '/guides', status: 200 },
  { path: '/skills/not-a-real-outcome', status: 404 },
  { path: '/collections/_CollectionAvatar', status: 404 },
  { path: '/skills/tag/plan', status: 301, location: '/skills/plan' },
  { path: '/skills/tag/cloudflare', status: 200 },
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
): Promise<SmokeObservation | Extract<SmokeEvaluation, { _tag: 'failed' }>> {
  return fetch(new URL(path, baseUrl).toString(), {
    redirect: 'manual',
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'skilld-production-smoke/1',
    },
  }).then(async (response) => {
    await response.arrayBuffer()
    return {
      status: response.status,
      location: response.headers.get('location'),
    }
  }).catch((error: unknown) => ({
    _tag: 'failed' as const,
    reason: 'network_error' as const,
    expected: 'response',
    actual: errorMessage(error),
  }))
}

export async function runProductionSmoke(
  dependencies: ProductionSmokeDependencies,
): Promise<ProductionSmokeResult> {
  const attempts = Math.max(1, Math.floor(dependencies.attempts ?? 6))
  const retryDelayMs = Math.max(0, Math.floor(dependencies.retryDelayMs ?? 5_000))
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
      if (evaluation._tag === 'passed')
        return { _tag: 'passed' as const, path: expectation.path, attempts: attempt }
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
  return {
    _tag: 'passed',
    checks: results.map(result => ({ path: result.path, attempts: result.attempts })),
  }
}
