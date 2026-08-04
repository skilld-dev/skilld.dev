export interface HistoryPoint {
  at: number
  value: number
}

export interface StarObservation {
  observedDay: number
  stars: number
}

export type StarHistory = {
  _tag: 'untracked'
  points: []
} | {
  _tag: 'collecting'
  trackedSince: number
  points: [HistoryPoint]
} | {
  _tag: 'ready'
  approximate: true
  trackedSince: number
  points: HistoryPoint[]
}

const SECONDS_PER_DAY = 86_400
export const STAR_HISTORY_RETENTION_DAYS = 90

function downsamplePoints(points: HistoryPoint[], limit: number): HistoryPoint[] {
  if (points.length <= limit)
    return points
  if (limit <= 1)
    return [points.at(-1)!]

  const lastIndex = points.length - 1
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * lastIndex / (limit - 1))]!)
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

export function buildObservedStarHistory(observations: StarObservation[]): StarHistory {
  const points = observations
    .map(observation => ({ at: observation.observedDay, value: observation.stars }))
    .sort((left, right) => left.at - right.at)

  if (points.length === 0)
    return { _tag: 'untracked', points: [] }
  if (points.length === 1)
    return { _tag: 'collecting', trackedSince: points[0]!.at, points: [points[0]!] }

  return {
    _tag: 'ready',
    approximate: true,
    trackedSince: points[0]!.at,
    points,
  }
}

export function repoStarObservationStatements(
  db: D1Database,
  owner: string,
  repo: string,
  stars: number,
  observedAt: number,
): D1PreparedStatement[] {
  const observedDay = Math.floor(observedAt / SECONDS_PER_DAY) * SECONDS_PER_DAY
  const oldestRetainedDay = observedDay - (STAR_HISTORY_RETENTION_DAYS - 1) * SECONDS_PER_DAY

  return [
    db.prepare(`
      INSERT INTO repo_star_observations (owner, repo, observed_day, stars)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(owner, repo, observed_day) DO UPDATE SET stars = excluded.stars
    `).bind(owner, repo, observedDay, Math.max(0, Math.floor(stars))),
    db.prepare(`
      DELETE FROM repo_star_observations
      WHERE owner = ? AND repo = ? AND observed_day < ?
    `).bind(owner, repo, oldestRetainedDay),
  ]
}
