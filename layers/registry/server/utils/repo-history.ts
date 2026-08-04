import type { GithubBindings } from './github-client'

export interface HistoryPoint {
  at: number
  value: number
}

export interface StargazerSamplePage {
  page: number
  stars: Array<{ starredAt: number }>
}

type StarHistoryFailureReason = 'github_status' | 'invalid_response' | 'network'

export type StarHistory = {
  _tag: 'ready'
  approximate: true
  points: HistoryPoint[]
  sampledAt: number
} | {
  _tag: 'unavailable'
  reason: StarHistoryFailureReason
  status: number | null
  sampledAt: number
}

interface StarHistoryDependencies {
  fetch: typeof globalThis.fetch
  now: () => number
  pageBudget: number
}

type StargazerPageResult = {
  _tag: 'ready'
  page: StargazerSamplePage
  link: string | null
} | {
  _tag: 'unavailable'
  reason: StarHistoryFailureReason
  status: number | null
}

const STARGAZERS_PER_PAGE = 100

function downsamplePoints(points: HistoryPoint[], limit: number): HistoryPoint[] {
  if (points.length <= limit)
    return points
  if (limit <= 1)
    return [points.at(-1)!]

  const lastIndex = points.length - 1
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * lastIndex / (limit - 1))]!)
}

function mergePoints(points: HistoryPoint[]): HistoryPoint[] {
  const valuesByTime = new Map<number, number>()
  for (const point of points) {
    const previous = valuesByTime.get(point.at) ?? 0
    valuesByTime.set(point.at, Math.max(previous, point.value))
  }
  return [...valuesByTime]
    .sort(([left], [right]) => left - right)
    .map(([at, value]) => ({ at, value }))
}

export function buildCumulativeSkillHistory(
  firstSeenAt: Array<number | null>,
  now: number,
  limit = 16,
  baselineAt?: number | null,
): HistoryPoint[] {
  if (firstSeenAt.length === 0)
    return []

  const currentAt = Math.floor(now)
  const sorted = firstSeenAt
    .filter((at): at is number => typeof at === 'number' && Number.isFinite(at) && at > 0)
    .map(at => Math.min(Math.floor(at), currentAt))
    .sort((left, right) => left - right)

  const points: HistoryPoint[] = []
  let count = 0
  for (let index = 0; index < sorted.length;) {
    const at = sorted[index]!
    while (index < sorted.length && sorted[index] === at) {
      count++
      index++
    }
    points.push({ at, value: count })
  }

  const firstPoint = points[0]
  if (
    firstPoint
    && typeof baselineAt === 'number'
    && Number.isFinite(baselineAt)
    && baselineAt > 0
    && baselineAt < firstPoint.at
  ) {
    points.unshift({ at: Math.floor(baselineAt), value: 0 })
  }

  const current = { at: currentAt, value: firstSeenAt.length }
  if (points.at(-1)?.at === current.at)
    points[points.length - 1] = current
  else
    points.push(current)

  return downsamplePoints(points, Math.max(1, Math.floor(limit)))
}

export function selectHistoryPages(totalPages: number, budget = 16): number[] {
  const pages = Math.max(0, Math.floor(totalPages))
  const count = Math.min(pages, Math.max(1, Math.floor(budget)))
  if (count === 0)
    return []
  if (count === 1)
    return [pages]

  return Array.from({ length: count }, (_, index) => Math.round(1 + index * (pages - 1) / (count - 1)))
}

export function buildSampledStarHistory(
  samples: StargazerSamplePage[],
  totalPages: number,
): HistoryPoint[] {
  if (totalPages <= 0)
    return []

  const points = samples.flatMap(({ page, stars }) => {
    const first = stars[0]
    return first
      ? [{ at: first.starredAt, value: (page - 1) * STARGAZERS_PER_PAGE + 1 }]
      : []
  })
  const lastPage = samples.find(sample => sample.page === totalPages)
  const lastStar = lastPage?.stars.at(-1)
  if (lastPage && lastStar) {
    points.push({
      at: lastStar.starredAt,
      value: (totalPages - 1) * STARGAZERS_PER_PAGE + lastPage.stars.length,
    })
  }

  return mergePoints(points)
}

function parseStargazers(input: unknown): Array<{ starredAt: number }> | null {
  if (!Array.isArray(input))
    return null

  const stars: Array<{ starredAt: number }> = []
  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object' || !('starred_at' in candidate) || typeof candidate.starred_at !== 'string')
      return null
    const milliseconds = Date.parse(candidate.starred_at)
    if (!Number.isFinite(milliseconds))
      return null
    stars.push({ starredAt: Math.floor(milliseconds / 1000) })
  }
  return stars
}

function parseLastPage(link: string | null): number {
  if (!link)
    return 1
  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="last"/)
    if (!match?.[1])
      continue
    const pageMatch = match[1].match(/[?&]page=(\d+)(?:&|$)/)
    const page = Number(pageMatch?.[1])
    if (Number.isInteger(page) && page > 0)
      return page
  }
  return 1
}

async function fetchStargazerPage(
  owner: string,
  repo: string,
  page: number,
  bindings: GithubBindings,
  fetchImpl: typeof globalThis.fetch,
): Promise<StargazerPageResult> {
  const headers = new Headers()
  headers.set('Accept', 'application/vnd.github.star+json')
  headers.set('User-Agent', 'skilld.dev')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (bindings.GITHUB_TOKEN)
    headers.set('Authorization', `Bearer ${bindings.GITHUB_TOKEN}`)

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stargazers?per_page=${STARGAZERS_PER_PAGE}&page=${page}`
  const response = await fetchImpl(url, { headers }).catch((error) => {
    console.warn(`[repo-history] GitHub stargazer page ${page} request failed`, error)
    return null
  })
  if (!response) {
    return { _tag: 'unavailable', reason: 'network', status: null }
  }
  if (!response.ok) {
    return { _tag: 'unavailable', reason: 'github_status', status: response.status }
  }

  const body = await response.json().catch((error) => {
    console.warn(`[repo-history] GitHub stargazer page ${page} returned invalid JSON`, error)
    return null
  })
  const stars = parseStargazers(body)
  if (!stars) {
    return { _tag: 'unavailable', reason: 'invalid_response', status: response.status }
  }
  return {
    _tag: 'ready',
    page: { page, stars },
    link: response.headers.get('link'),
  }
}

export async function fetchGithubStarHistory(
  owner: string,
  repo: string,
  bindings: GithubBindings,
  dependencies: StarHistoryDependencies,
): Promise<StarHistory> {
  const sampledAt = Math.floor(dependencies.now())
  const first = await fetchStargazerPage(owner, repo, 1, bindings, dependencies.fetch)
  if (first._tag === 'unavailable')
    return { ...first, sampledAt }

  const totalPages = parseLastPage(first.link)
  const budget = Math.min(16, Math.max(1, Math.floor(dependencies.pageBudget)))
  const pages = selectHistoryPages(totalPages, budget)
  const remaining = await Promise.all(
    pages
      .filter(page => page !== 1)
      .map(page => fetchStargazerPage(owner, repo, page, bindings, dependencies.fetch)),
  )
  const failed = remaining.find(result => result._tag === 'unavailable')
  if (failed?._tag === 'unavailable')
    return { ...failed, sampledAt }

  const samples = [first, ...remaining]
    .filter((result): result is Extract<StargazerPageResult, { _tag: 'ready' }> => result._tag === 'ready')
    .map(result => result.page)
  return {
    _tag: 'ready',
    approximate: true,
    points: buildSampledStarHistory(samples, totalPages),
    sampledAt,
  }
}
