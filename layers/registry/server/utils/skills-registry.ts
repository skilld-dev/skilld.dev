import type { H3Event } from 'h3'
import type { DuplicateCandidate, DuplicateGroupReason } from './skill-duplicate-canonical'
import { getDB } from '../../../../shared/server/db'
import {
  duplicateWeakerSlugSet,
  findDuplicateGroupForSlug,
  skillSlug,
} from './skill-duplicate-canonical'
import { SUPPORTED_SKILL_SQL } from './supported-sources'

const WHITESPACE_RE = /\s+/

// Skills flagged broken less than 7 days ago stay visible (grace period for
// transient upstream issues). After that they fall off listings/search/sitemap
// but the detail page remains reachable so deep links don't 404.
const BROKEN_GRACE_SECONDS = 7 * 86400
const NOT_BROKEN_SQL = `(skills.broken_since IS NULL OR skills.broken_since > unixepoch() - ${BROKEN_GRACE_SECONDS})`

// Aggregator repos (>100 skills, mostly awesome-list republishers) are excluded
// from anonymous discovery surfaces. Detail pages remain reachable.
const NOT_AGGREGATOR_SQL = `skills.repo_kind != 'aggregator'`

export interface RegistrySkill {
  name: string
  owner: string
  repo: string
  displayName: string
  installs: number
  slug: string
  stars: number
  description: string | null
  seoIndexScore: number
  seoIndexable: boolean
  trustTier: string
  trustScore: number
  pushedAt: number | null
  modifiedAt: number | null
}

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string
  installs: number
  slug: string
  stars: number | null
  description: string | null
  seo_index_score: number | null
  seo_indexable: number | null
  trust_tier: string | null
  trust_score: number | null
  pushed_at: number | null
  modified_at: number | null
}

function rowToSkill(row: SkillRow): RegistrySkill {
  return {
    name: row.name,
    owner: row.owner,
    repo: row.repo,
    displayName: row.display_name,
    installs: row.installs,
    slug: row.slug,
    stars: row.stars ?? 0,
    description: row.description ?? null,
    seoIndexScore: row.seo_index_score ?? 0,
    seoIndexable: row.seo_indexable === 1,
    trustTier: row.trust_tier ?? 'untrusted',
    trustScore: row.trust_score ?? 0,
    pushedAt: row.pushed_at ?? null,
    modifiedAt: row.modified_at ?? null,
  }
}

export interface SkillsQuery {
  search?: string
  owner?: string
  official?: boolean
  excludeOfficial?: boolean
  supportedOnly?: boolean
  trustTier?: string
  category?: string
  sort?: 'installs' | 'name' | 'owner'
  page?: number
  limit?: number
  officialOwners?: Set<string>
}

interface SkillsQueryResult {
  items: RegistrySkill[]
  total: number
  page: number
  pages: number
  facets: { owner: string, count: number }[]
}

interface RepoRef {
  owner: string
  repo: string
}

const MAX_REPO_FILTER_REFS = 40

function repoPairFilter(repos: RepoRef[]): { sql: string, params: string[] } {
  return {
    sql: repos.map(() => '(owner = ? AND repo = ?)').join(' OR '),
    params: repos.flatMap(({ owner, repo }) => [owner, repo]),
  }
}

function chunkRepos(repos: RepoRef[]): RepoRef[][] {
  const chunks: RepoRef[][] = []
  for (let i = 0; i < repos.length; i += MAX_REPO_FILTER_REFS)
    chunks.push(repos.slice(i, i + MAX_REPO_FILTER_REFS))
  return chunks
}

export async function querySkills(event: H3Event, opts: SkillsQuery): Promise<SkillsQueryResult> {
  const db = getDB(event)
  const { search, owner, official, excludeOfficial, supportedOnly, trustTier, category, sort = 'installs', page = 1, limit = 60, officialOwners } = opts

  const conditions: string[] = [NOT_BROKEN_SQL]
  const params: (string | number)[] = []

  // FTS search
  if (search) {
    // FTS5 match with prefix search
    const ftsQuery = search.split(WHITESPACE_RE).map(t => `"${t}"*`).join(' ')
    conditions.push('skills.rowid IN (SELECT rowid FROM skills_fts WHERE skills_fts MATCH ?)')
    params.push(ftsQuery)
  }

  if (owner) {
    conditions.push('skills.owner = ?')
    params.push(owner)
  }

  if (official && officialOwners?.size) {
    const placeholders = Array.from(officialOwners, () => '?').join(',')
    conditions.push(`skills.owner IN (${placeholders})`)
    params.push(...officialOwners)
  }

  if (excludeOfficial && officialOwners?.size) {
    const placeholders = Array.from(officialOwners, () => '?').join(',')
    conditions.push(`skills.owner NOT IN (${placeholders})`)
    params.push(...officialOwners)
  }

  if (supportedOnly)
    conditions.push(`(${SUPPORTED_SKILL_SQL})`)

  if (trustTier) {
    conditions.push('skills.trust_tier = ?')
    params.push(trustTier)
  }

  if (category) {
    conditions.push('skills.abstractness_category = ?')
    params.push(category)
  }

  // Anonymous discovery (Loop 1) hides aggregators. Owner profiles, official
  // sections, and supported-only views show everything since the user already
  // chose a scope.
  const isAnonymousBrowse = !owner && !official && !supportedOnly
  if (isAnonymousBrowse)
    conditions.push(NOT_AGGREGATOR_SQL)

  const where = `WHERE ${conditions.join(' AND ')}`

  // Count query
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM skills ${where}`).bind(...params)

  // Sort
  let orderBy: string
  if (sort === 'name')
    orderBy = 'skills.name ASC'
  else if (sort === 'owner')
    orderBy = 'skills.owner ASC, skills.name ASC'
  else orderBy = 'skills.installs DESC'

  const offset = (page - 1) * limit
  const dataStmt = db
    .prepare(`SELECT * FROM skills ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .bind(...params, limit, offset)

  // Facets: top owners from filtered results
  const facetStmt = db
    .prepare(`SELECT owner, COUNT(*) as count FROM skills ${where} GROUP BY owner ORDER BY count DESC LIMIT 20`)
    .bind(...params)

  const [countRes, dataRes, facetRes] = await Promise.all([
    countStmt.first<{ total: number }>(),
    dataStmt.all<SkillRow>(),
    facetStmt.all<{ owner: string, count: number }>(),
  ])

  return {
    items: (dataRes.results ?? []).map(rowToSkill),
    total: countRes?.total ?? 0,
    page,
    pages: Math.ceil((countRes?.total ?? 0) / limit),
    facets: facetRes.results ?? [],
  }
}

export interface SkillLookup {
  packageName: string
  owner?: string
}

/**
 * Resolve skill rows for a list of (packageName, owner?) pairs.
 * When owner is known, the exact (owner, name) row is returned. When owner
 * is missing (legacy collection entries), the highest-installs row for that
 * name wins. Result is keyed by packageName.
 */
export async function findSkillsByLookups(
  event: H3Event,
  lookups: SkillLookup[],
  opts: { includeBroken?: boolean, supportedOnly?: boolean } = {},
): Promise<Map<string, RegistrySkill>> {
  if (!lookups.length)
    return new Map()
  const db = getDB(event)
  const uniqueNames = [...new Set(lookups.map(l => l.packageName))]
  const placeholders = uniqueNames.map(() => '?').join(',')
  const brokenClause = opts.includeBroken ? '' : ` AND ${NOT_BROKEN_SQL}`
  const supportedClause = opts.supportedOnly ? ` AND (${SUPPORTED_SKILL_SQL})` : ''
  const rows = await db
    .prepare(`SELECT * FROM skills WHERE name IN (${placeholders})${brokenClause}${supportedClause}`)
    .bind(...uniqueNames)
    .all<SkillRow>()

  const rowsByName = new Map<string, SkillRow[]>()
  for (const r of rows.results ?? []) {
    const list = rowsByName.get(r.name) ?? []
    list.push(r)
    rowsByName.set(r.name, list)
  }

  const map = new Map<string, RegistrySkill>()
  for (const { packageName, owner } of lookups) {
    const candidates = rowsByName.get(packageName)
    if (!candidates?.length)
      continue
    const row = owner
      ? candidates.find(c => c.owner === owner)
      : [...candidates].sort((a, b) => b.installs - a.installs)[0]
    if (row)
      map.set(packageName, rowToSkill(row))
  }
  return map
}

/**
 * Return owners (from the given allowlist) ranked by actual skill count in the
 * registry, descending. Useful for picking which official orgs to feature when
 * the static manifest has drifted from the DB.
 */
export async function getTopOwnersByCount(
  event: H3Event,
  allowedOwners: Set<string>,
  limit: number,
): Promise<{ owner: string, count: number }[]> {
  if (!allowedOwners.size)
    return []
  const db = getDB(event)
  const placeholders = Array.from(allowedOwners, () => '?').join(',')
  const res = await db
    .prepare(
      `SELECT owner, COUNT(*) as count FROM skills
       WHERE owner IN (${placeholders}) AND ${NOT_BROKEN_SQL}
       GROUP BY owner
       ORDER BY count DESC
       LIMIT ?`,
    )
    .bind(...allowedOwners, limit)
    .all<{ owner: string, count: number }>()
  return res.results ?? []
}

/**
 * Return official repo sections by exact repo allowlist, not by owner. This
 * avoids treating every repo under a trusted GitHub org as official.
 */
export async function getTopReposByCount(
  event: H3Event,
  allowedRepos: RepoRef[],
  limit: number,
): Promise<{ owner: string, repo: string, count: number }[]> {
  if (!allowedRepos.length)
    return []
  const db = getDB(event)
  const rows = await Promise.all(chunkRepos(allowedRepos).map(async (repos) => {
    const filter = repoPairFilter(repos)
    const res = await db
      .prepare(
        `SELECT owner, repo, COUNT(*) as count FROM skills
         WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
         GROUP BY owner, repo
         ORDER BY count DESC
         LIMIT ?`,
      )
      .bind(...filter.params, limit)
      .all<{ owner: string, repo: string, count: number }>()
    return res.results ?? []
  }))
  return rows.flat().sort((a, b) => b.count - a.count).slice(0, limit)
}

export async function getTopReposByStars(
  event: H3Event,
  allowedRepos: RepoRef[],
  limit: number,
): Promise<{ owner: string, repo: string, count: number, stars: number }[]> {
  if (!allowedRepos.length)
    return []
  const db = getDB(event)
  const rows = await Promise.all(chunkRepos(allowedRepos).map(async (repos) => {
    const filter = repoPairFilter(repos)
    const res = await db
      .prepare(
        `SELECT owner, repo, COUNT(*) as count, MAX(stars) as stars FROM skills
         WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
         GROUP BY owner, repo
         ORDER BY stars DESC, count DESC
         LIMIT ?`,
      )
      .bind(...filter.params, limit)
      .all<{ owner: string, repo: string, count: number, stars: number }>()
    return res.results ?? []
  }))
  return rows.flat().sort((a, b) => b.stars - a.stars || b.count - a.count).slice(0, limit)
}

/**
 * Rank owners by max GitHub repo stars (per-skill stars are denormalized from
 * the repo, so MAX collapses to the repo's star count). Returns count too so
 * callers can render the same shape as `getTopOwnersByCount`.
 */
export async function getTopOwnersByStars(
  event: H3Event,
  allowedOwners: Set<string>,
  limit: number,
): Promise<{ owner: string, count: number, stars: number }[]> {
  if (!allowedOwners.size)
    return []
  const db = getDB(event)
  const placeholders = Array.from(allowedOwners, () => '?').join(',')
  const res = await db
    .prepare(
      `SELECT owner, COUNT(*) as count, MAX(stars) as stars FROM skills
       WHERE owner IN (${placeholders}) AND ${NOT_BROKEN_SQL}
       GROUP BY owner
       ORDER BY stars DESC, count DESC
       LIMIT ?`,
    )
    .bind(...allowedOwners, limit)
    .all<{ owner: string, count: number, stars: number }>()
  return res.results ?? []
}

export interface FeaturedOrgSection {
  owner: string
  repo: string
  totalSkills: number
  skills: RegistrySkill[]
}

/**
 * For each owner in `owners`, return up to `perOrg` skills ranked by installs
 * desc, plus the owner's total skill count. Order of returned sections matches
 * the input `owners` array. Single SQL pass via window function.
 */
export async function getFeaturedOfficialSections(
  event: H3Event,
  repos: RepoRef[],
  perOrg: number,
): Promise<FeaturedOrgSection[]> {
  if (!repos.length)
    return []
  const db = getDB(event)
  const filter = repoPairFilter(repos)

  const rankedStmt = db
    .prepare(
      `SELECT * FROM (
        SELECT skills.*,
          ROW_NUMBER() OVER (PARTITION BY owner, repo ORDER BY installs DESC, name ASC) AS rn,
          COUNT(*) OVER (PARTITION BY owner, repo) AS repo_total
        FROM skills
        WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
      ) WHERE rn <= ?`,
    )
    .bind(...filter.params, perOrg)

  const res = await rankedStmt.all<SkillRow & { rn: number, repo_total: number }>()
  const rows = res.results ?? []

  const byRepo = new Map<string, { skills: RegistrySkill[], total: number }>()
  for (const r of rows) {
    const key = `${r.owner}/${r.repo}`
    const entry = byRepo.get(key) ?? { skills: [], total: r.repo_total }
    entry.skills.push(rowToSkill(r))
    byRepo.set(key, entry)
  }

  return repos
    .map(({ owner, repo }) => {
      const entry = byRepo.get(`${owner}/${repo}`)
      if (!entry)
        return null
      return { owner, repo, totalSkills: entry.total, skills: entry.skills }
    })
    .filter((s): s is FeaturedOrgSection => s !== null)
}

export interface SkillSitemapEntry {
  name: string
  owner: string
  repo: string
}

interface SkillDuplicateRow extends DuplicateCandidate {
  is_supported: number
}

export interface SkillDuplicateSibling {
  name: string
  owner: string
  repo: string
  displayName: string
  installs: number
  stars: number
  slug: string
  supportTier: string | null
  trustTier: string | null
}

export interface SkillDuplicateGroup {
  reason: DuplicateGroupReason
  canonical: SkillDuplicateSibling
  isCanonical: boolean
  siblings: SkillDuplicateSibling[]
}

function duplicateRowToSibling(row: DuplicateCandidate): SkillDuplicateSibling {
  return {
    name: row.name,
    owner: row.owner,
    repo: row.repo,
    displayName: row.display_name,
    installs: row.installs ?? 0,
    stars: row.stars ?? 0,
    slug: skillSlug(row),
    supportTier: row.support_tier,
    trustTier: row.trust_tier,
  }
}

async function listDuplicateCandidateRows(
  event: H3Event,
  opts: { supportedOnly: boolean, includeAggregators?: boolean },
): Promise<SkillDuplicateRow[]> {
  const db = getDB(event)
  const supportedSelect = `CASE WHEN (${SUPPORTED_SKILL_SQL}) THEN 1 ELSE 0 END`
  const supportedFilter = opts.supportedOnly ? `AND (${SUPPORTED_SKILL_SQL})` : ''
  const aggregatorFilter = opts.includeAggregators ? '' : `AND ${NOT_AGGREGATOR_SQL}`
  const res = await db
    .prepare(`
      SELECT
        skills.owner,
        skills.repo,
        skills.name,
        skills.display_name,
        skills.description,
        skills.installs,
        skills.stars,
        skills.pushed_at,
        supported_repos.support_tier,
        skills.trust_tier,
        ${supportedSelect} AS is_supported
      FROM skills
      LEFT JOIN supported_repos
        ON supported_repos.owner = skills.owner
        AND supported_repos.repo = skills.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND skills.seo_indexable = 1
        ${aggregatorFilter}
        ${supportedFilter}
      ORDER BY skills.owner ASC, skills.repo ASC, skills.name ASC
    `)
    .all<SkillDuplicateRow>()
  return res.results ?? []
}

export async function findSupportedDuplicateGroupForSkill(event: H3Event, slug: string): Promise<SkillDuplicateGroup | null> {
  const rows = await listDuplicateCandidateRows(event, { supportedOnly: true })
  return findDuplicateGroupInRows(rows, slug)
}

export async function findDuplicateGroupForSkill(event: H3Event, slug: string): Promise<SkillDuplicateGroup | null> {
  const rows = await listDuplicateCandidateRows(event, { supportedOnly: false, includeAggregators: true })
  return findDuplicateGroupInRows(rows, slug)
}

function findDuplicateGroupInRows(rows: SkillDuplicateRow[], slug: string): SkillDuplicateGroup | null {
  const group = findDuplicateGroupForSlug(rows, slug)
  if (!group)
    return null
  const canonicalSlug = skillSlug(group.canonical)
  return {
    reason: group.reason,
    canonical: duplicateRowToSibling(group.canonical),
    isCanonical: canonicalSlug === slug,
    siblings: group.rows
      .filter(row => skillSlug(row) !== slug)
      .map(duplicateRowToSibling),
  }
}

export async function listAllSkillsForSitemap(event: H3Event): Promise<SkillSitemapEntry[]> {
  const db = getDB(event)
  const res = await db
    .prepare(`
      SELECT
        skills.name,
        skills.owner,
        skills.repo,
        skills.display_name,
        skills.description,
        skills.installs,
        skills.stars,
        skills.pushed_at,
        supported_repos.support_tier,
        skills.trust_tier,
        CASE WHEN (${SUPPORTED_SKILL_SQL}) THEN 1 ELSE 0 END AS is_supported
      FROM skills
      LEFT JOIN supported_repos
        ON supported_repos.owner = skills.owner
        AND supported_repos.repo = skills.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND skills.seo_indexable = 1
        AND ${NOT_AGGREGATOR_SQL}
      ORDER BY skills.owner ASC, skills.repo ASC, skills.name ASC
    `)
    .all<SkillDuplicateRow>()
  const rows = res.results ?? []
  const weakerSupportedSlugs = duplicateWeakerSlugSet(rows.filter(row => row.is_supported === 1))
  return rows
    .filter(row => !weakerSupportedSlugs.has(skillSlug(row)))
    .map(row => ({ name: row.name, owner: row.owner, repo: row.repo }))
}

export async function listSupportedSkillsForSitemap(event: H3Event): Promise<SkillSitemapEntry[]> {
  const rows = await listDuplicateCandidateRows(event, { supportedOnly: true })
  const weakerSlugs = duplicateWeakerSlugSet(rows)
  return rows
    .filter(row => !weakerSlugs.has(skillSlug(row)))
    .map(row => ({ name: row.name, owner: row.owner, repo: row.repo }))
}

export async function listAllOwnersForSitemap(event: H3Event): Promise<{ owner: string }[]> {
  const db = getDB(event)
  const res = await db
    .prepare(`SELECT DISTINCT owner FROM skills WHERE ${NOT_BROKEN_SQL} ORDER BY owner ASC`)
    .all<{ owner: string }>()
  return res.results ?? []
}

export async function findRelatedSkills(
  event: H3Event,
  opts: { owner: string, repo: string, excludeName: string, limit?: number },
): Promise<{ sameRepo: RegistrySkill[], sameOwner: RegistrySkill[] }> {
  const db = getDB(event)
  const { owner, repo, excludeName, limit = 6 } = opts

  const [repoRes, ownerRes] = await Promise.all([
    db
      .prepare(`SELECT * FROM skills WHERE owner = ? AND repo = ? AND name != ? AND ${NOT_BROKEN_SQL} ORDER BY installs DESC LIMIT ?`)
      .bind(owner, repo, excludeName, limit)
      .all<SkillRow>(),
    db
      .prepare(`SELECT * FROM skills WHERE owner = ? AND NOT (repo = ?) AND name != ? AND ${NOT_BROKEN_SQL} ORDER BY installs DESC LIMIT ?`)
      .bind(owner, repo, excludeName, limit)
      .all<SkillRow>(),
  ])

  return {
    sameRepo: (repoRes.results ?? []).map(rowToSkill),
    sameOwner: (ownerRes.results ?? []).map(rowToSkill),
  }
}

export async function findSkill(event: H3Event, slug: string): Promise<RegistrySkill | null> {
  const db = getDB(event)
  const row = await db
    .prepare('SELECT * FROM skills WHERE slug = ?')
    .bind(slug)
    .first<SkillRow>()

  if (!row) {
    // Try matching with repo in slug: owner/repo/name
    const parts = slug.split('/')
    if (parts.length >= 3) {
      const owner = parts[0]
      const repo = parts[1]
      const name = parts.slice(2).join('/')
      const altRow = await db
        .prepare('SELECT * FROM skills WHERE owner = ? AND repo = ? AND name = ?')
        .bind(owner, repo, name)
        .first<SkillRow>()
      return altRow ? rowToSkill(altRow) : null
    }
    return null
  }
  return rowToSkill(row)
}
