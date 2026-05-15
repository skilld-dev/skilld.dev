import { defineApiHandler } from '#shared/server/handler'

const BROKEN_GRACE_SECONDS = 7 * 86400
const NOT_BROKEN_SQL = `(broken_since IS NULL OR broken_since > unixepoch() - ${BROKEN_GRACE_SECONDS})`

export interface StatsBin {
  label: string
  count: number
}

export interface ScatterPoint {
  name: string
  owner: string
  stars: number
  installs: number
}

export interface OwnerLeader {
  owner: string
  stars: number
  skills: number
}

export interface SkillsStats {
  summary: {
    skills: number
    repos: number
    owners: number
    avgStars: number
  }
  starHistogram: StatsBin[]
  starHistogramTotal: number
  maintenance: StatsBin[]
  ageCohorts: StatsBin[]
  topOwners: OwnerLeader[]
  scatter: ScatterPoint[]
  skillsPerRepo: StatsBin[]
}

const STAR_BINS: { label: string, min: number, max: number }[] = [
  { label: '0', min: 0, max: 0 },
  { label: '1-9', min: 1, max: 9 },
  { label: '10-99', min: 10, max: 99 },
  { label: '100-999', min: 100, max: 999 },
  { label: '1k-9.9k', min: 1000, max: 9999 },
  { label: '10k+', min: 10000, max: Number.MAX_SAFE_INTEGER },
]

const MAINTENANCE_BINS: { label: string, maxDays: number | null }[] = [
  { label: '< 7d', maxDays: 7 },
  { label: '7-30d', maxDays: 30 },
  { label: '30-90d', maxDays: 90 },
  { label: '90-180d', maxDays: 180 },
  { label: '180d-1y', maxDays: 365 },
  { label: '> 1y', maxDays: null },
]

const AGE_BINS: { label: string, maxDays: number | null }[] = [
  { label: '< 1mo', maxDays: 30 },
  { label: '1-3mo', maxDays: 90 },
  { label: '3-6mo', maxDays: 180 },
  { label: '6-12mo', maxDays: 365 },
  { label: '1-2y', maxDays: 730 },
  { label: '> 2y', maxDays: null },
]

const REPO_BINS: { label: string, min: number, max: number }[] = [
  { label: '1', min: 1, max: 1 },
  { label: '2-3', min: 2, max: 3 },
  { label: '4-9', min: 4, max: 9 },
  { label: '10-24', min: 10, max: 24 },
  { label: '25+', min: 25, max: Number.MAX_SAFE_INTEGER },
]

function bucketByValue<T extends { min: number, max: number }>(
  bins: T[],
  value: number,
): T | null {
  return bins.find(b => value >= b.min && value <= b.max) ?? null
}

function bucketByDays<T extends { maxDays: number | null }>(
  bins: T[],
  days: number,
): T {
  for (const b of bins) {
    if (b.maxDays === null || days <= b.maxDays)
      return b
  }
  return bins[bins.length - 1]!
}

export default defineApiHandler<never, SkillsStats>({
  handler: async ({ platform }): Promise<SkillsStats> => {
    const db = platform.db
    const nowSec = Math.floor(Date.now() / 1000)

    const [
      summaryRow,
      skillRepoStarsRes,
      repoMetaRes,
      ownersRes,
      scatterRes,
      perRepoRes,
    ] = await Promise.all([
      db
        .prepare(
          `SELECT
          COUNT(*) AS skills,
          COUNT(DISTINCT owner || '/' || repo) AS repos,
          COUNT(DISTINCT owner) AS owners,
          AVG(stars) AS avg_stars
        FROM skills_v WHERE ${NOT_BROKEN_SQL}`,
        )
        .first<{ skills: number, repos: number, owners: number, avg_stars: number | null }>(),

      // Chart 1: distinct (owner, repo) pairs where repo name contains "skill",
      // with their star count. One row per repo.
      db
        .prepare(
          `SELECT owner, repo, MAX(stars) AS stars
        FROM skills_v
        WHERE ${NOT_BROKEN_SQL} AND LOWER(repo) LIKE '%skill%'
        GROUP BY owner, repo`,
        )
        .all<{ owner: string, repo: string, stars: number }>(),

      // Charts 2 & 3: distinct repos with pushed_at and repo_created_at.
      db
        .prepare(
          `SELECT owner, repo, MAX(pushed_at) AS pushed_at, MAX(repo_created_at) AS repo_created_at
        FROM skills_v WHERE ${NOT_BROKEN_SQL}
        GROUP BY owner, repo`,
        )
        .all<{ owner: string, repo: string, pushed_at: number | null, repo_created_at: number | null }>(),

      // Chart 4: top 15 owners by max stars. Tie-break by total skill count.
      db
        .prepare(
          `SELECT owner, MAX(stars) AS stars, COUNT(*) AS skills
        FROM skills_v WHERE ${NOT_BROKEN_SQL}
        GROUP BY owner
        ORDER BY stars DESC, skills DESC
        LIMIT 15`,
        )
        .all<{ owner: string, stars: number, skills: number }>(),

      // Chart 5: scatter of skills with non-zero signal. With 80k+ skills in the
      // registry (most with 0 stars, 0 installs), plotting everything is noise
      // and makes the SVG unrenderable. Filter to skills with at least some
      // signal and cap to keep the page light.
      db
        .prepare(
          `SELECT name, owner, stars, installs
        FROM skills_v
        WHERE ${NOT_BROKEN_SQL} AND (stars > 0 OR installs > 0)
        ORDER BY (stars + installs) DESC
        LIMIT 1500`,
        )
        .all<{ name: string, owner: string, stars: number, installs: number }>(),

      // Chart 6: count of skills per repo.
      db
        .prepare(
          `SELECT COUNT(*) AS n
        FROM skills_v WHERE ${NOT_BROKEN_SQL}
        GROUP BY owner, repo`,
        )
        .all<{ n: number }>(),
    ])

    const skillRepos = skillRepoStarsRes.results ?? []
    const starCounts = new Map(STAR_BINS.map(b => [b.label, 0]))
    for (const r of skillRepos) {
      const bin = bucketByValue(STAR_BINS, r.stars ?? 0)
      if (bin)
        starCounts.set(bin.label, (starCounts.get(bin.label) ?? 0) + 1)
    }

    const repoMeta = repoMetaRes.results ?? []
    const maintenanceCounts = new Map<string, number>([
      ...MAINTENANCE_BINS.map(b => [b.label, 0] as [string, number]),
      ['unknown', 0],
    ])
    const ageCounts = new Map<string, number>([
      ...AGE_BINS.map(b => [b.label, 0] as [string, number]),
      ['unknown', 0],
    ])
    for (const r of repoMeta) {
      if (r.pushed_at) {
        const days = Math.max(0, (nowSec - r.pushed_at) / 86400)
        const bin = bucketByDays(MAINTENANCE_BINS, days)
        maintenanceCounts.set(bin.label, (maintenanceCounts.get(bin.label) ?? 0) + 1)
      }
      else {
        maintenanceCounts.set('unknown', (maintenanceCounts.get('unknown') ?? 0) + 1)
      }

      if (r.repo_created_at) {
        const days = Math.max(0, (nowSec - r.repo_created_at) / 86400)
        const bin = bucketByDays(AGE_BINS, days)
        ageCounts.set(bin.label, (ageCounts.get(bin.label) ?? 0) + 1)
      }
      else {
        ageCounts.set('unknown', (ageCounts.get('unknown') ?? 0) + 1)
      }
    }

    const perRepoCounts = new Map(REPO_BINS.map(b => [b.label, 0]))
    for (const r of perRepoRes.results ?? []) {
      const bin = bucketByValue(REPO_BINS, r.n)
      if (bin)
        perRepoCounts.set(bin.label, (perRepoCounts.get(bin.label) ?? 0) + 1)
    }

    return {
      summary: {
        skills: summaryRow?.skills ?? 0,
        repos: summaryRow?.repos ?? 0,
        owners: summaryRow?.owners ?? 0,
        avgStars: Math.round(summaryRow?.avg_stars ?? 0),
      },
      starHistogram: STAR_BINS.map(b => ({ label: b.label, count: starCounts.get(b.label) ?? 0 })),
      starHistogramTotal: skillRepos.length,
      maintenance: [
        ...MAINTENANCE_BINS.map(b => ({ label: b.label, count: maintenanceCounts.get(b.label) ?? 0 })),
        { label: 'unknown', count: maintenanceCounts.get('unknown') ?? 0 },
      ],
      ageCohorts: [
        ...AGE_BINS.map(b => ({ label: b.label, count: ageCounts.get(b.label) ?? 0 })),
        { label: 'unknown', count: ageCounts.get('unknown') ?? 0 },
      ],
      topOwners: (ownersRes.results ?? []).map(o => ({
        owner: o.owner,
        stars: o.stars ?? 0,
        skills: o.skills,
      })),
      scatter: (scatterRes.results ?? []).map(s => ({
        name: s.name,
        owner: s.owner,
        stars: s.stars ?? 0,
        installs: s.installs ?? 0,
      })),
      skillsPerRepo: REPO_BINS.map(b => ({ label: b.label, count: perRepoCounts.get(b.label) ?? 0 })),
    }
  },
})
