import { defineApiHandler } from '#shared/server/handler'
import { notBrokenSql } from '../../utils/broken'

const NOT_BROKEN_SQL = notBrokenSql('r')
const FROM = 'FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo'

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
      summaryResult,
      skillRepoStarsResult,
      repoMetaResult,
      ownersResult,
      scatterResult,
      perRepoResult,
    ] = await db.batch([
      db
        .prepare(
          `SELECT
          COUNT(*) AS skills,
          COUNT(DISTINCT s.owner || '/' || s.repo) AS repos,
          COUNT(DISTINCT s.owner) AS owners,
          AVG(r.stars) AS avg_stars
        ${FROM} WHERE ${NOT_BROKEN_SQL}`,
        ),

      // Chart 1: distinct (owner, repo) pairs where repo name contains "skill",
      // with their star count. One row per repo.
      db
        .prepare(
          `SELECT s.owner, s.repo, MAX(r.stars) AS stars
        ${FROM}
        WHERE ${NOT_BROKEN_SQL} AND LOWER(s.repo) LIKE '%skill%'
        GROUP BY s.owner, s.repo`,
        ),

      // Charts 2 & 3: distinct repos with pushed_at and repo_created_at.
      db
        .prepare(
          `SELECT s.owner, s.repo, MAX(r.pushed_at) AS pushed_at, MAX(r.repo_created_at) AS repo_created_at
        ${FROM} WHERE ${NOT_BROKEN_SQL}
        GROUP BY s.owner, s.repo`,
        ),

      // Chart 4: top 15 owners by max stars. Tie-break by total skill count.
      db
        .prepare(
          `SELECT s.owner, MAX(r.stars) AS stars, COUNT(*) AS skills
        ${FROM} WHERE ${NOT_BROKEN_SQL}
        GROUP BY s.owner
        ORDER BY stars DESC, skills DESC
        LIMIT 15`,
        ),

      // Chart 5: scatter of skills with non-zero signal. With 80k+ skills in the
      // registry (most with 0 stars, 0 installs), plotting everything is noise
      // and makes the SVG unrenderable. Filter to skills with at least some
      // signal and cap to keep the page light.
      db
        .prepare(
          `SELECT s.name, s.owner, r.stars, s.installs
        ${FROM}
        WHERE ${NOT_BROKEN_SQL} AND (r.stars > 0 OR s.installs > 0)
        ORDER BY (r.stars + s.installs) DESC
        LIMIT 1500`,
        ),

      // Chart 6: count of skills per repo.
      db
        .prepare(
          `SELECT COUNT(*) AS n
        ${FROM} WHERE ${NOT_BROKEN_SQL}
        GROUP BY s.owner, s.repo`,
        ),
    ])

    const summaryRow = summaryResult?.results[0] as { skills: number, repos: number, owners: number, avg_stars: number | null } | undefined
    const skillRepos = (skillRepoStarsResult?.results ?? []) as { owner: string, repo: string, stars: number }[]
    const repoMeta = (repoMetaResult?.results ?? []) as { owner: string, repo: string, pushed_at: number | null, repo_created_at: number | null }[]
    const ownerRows = (ownersResult?.results ?? []) as { owner: string, stars: number, skills: number }[]
    const scatterRows = (scatterResult?.results ?? []) as { name: string, owner: string, stars: number, installs: number }[]
    const perRepoRows = (perRepoResult?.results ?? []) as { n: number }[]
    const starCounts = new Map(STAR_BINS.map(b => [b.label, 0]))
    for (const r of skillRepos) {
      const bin = bucketByValue(STAR_BINS, r.stars ?? 0)
      if (bin)
        starCounts.set(bin.label, (starCounts.get(bin.label) ?? 0) + 1)
    }

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
    for (const r of perRepoRows) {
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
      topOwners: ownerRows.map(o => ({
        owner: o.owner,
        stars: o.stars ?? 0,
        skills: o.skills,
      })),
      scatter: scatterRows.map(s => ({
        name: s.name,
        owner: s.owner,
        stars: s.stars ?? 0,
        installs: s.installs ?? 0,
      })),
      skillsPerRepo: REPO_BINS.map(b => ({ label: b.label, count: perRepoCounts.get(b.label) ?? 0 })),
    }
  },
})
