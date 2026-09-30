import type { H3Event } from 'h3'
import type { DuplicateCandidate, DuplicateGroupReason } from './skill-duplicate-canonical'
import type { AlternateSource, HybridSearchResult, SearchMode } from './skill-search'
import { getDB } from '#server/utils/db'
import { cached } from '#shared/server/cache'
import { githubSkillFileUrl } from '#shared/skill-file-url'
import { runAfterResponse } from './after-response'
import { JOIN_REPOS_SQL, notAggregatorSql, notBrokenSql } from './broken'
import { buildSkillDependencyMap, skillDependencyKey } from './skill-dependencies'
import {
  duplicateWeakerSlugSet,
  findDuplicateGroupForSlug,
  skillSlug,
} from './skill-duplicate-canonical'
import { canonicalRepoSkillPath } from './skill-routes'
import { collapseSearchDuplicates, hybridSkillSearch, rankSearchResults } from './skill-search'
import { SUPPORTED_SKILL_SQL } from './supported-sources'
import { SKILL_ADMITTED_SQL } from './trending-admission'

const NOT_BROKEN_SQL = notBrokenSql('r')
const NOT_AGGREGATOR_SQL = notAggregatorSql('r')
const FROM_SKILLS_JOIN_REPOS = `FROM skills s ${JOIN_REPOS_SQL}`
const SELECT_SKILL_ROW_BASE = `
  s.name,
  s.owner,
  s.repo,
  s.display_name,
  s.slug,
  s.like_count,
  s.description,
  s.rendered_raw_sha256,
  s.seo_index_score,
  s.seo_indexable,
  s.trust_tier,
  s.trust_score,
  s.modified_at,
  s.first_seen_at,
  s.rendered_skill_path,
  s.current_sha,
  r.stars,
  r.pushed_at,
  r.default_branch,
  r.source_owner,
  r.source_repo,
  (SELECT o.name FROM owners o WHERE o.owner = s.owner) AS author_name`

/**
 * Resolved-Skill total for the repo of the row aliased `alias`.
 *
 * Correlated, so it reads every Skill of that repo once per row it runs on.
 * That is cheap on a page of rows and costly before one: in the select list of
 * a sorted listing it runs for every match, since the sorter carries whole
 * rows, which is sum(c^2) reads over the matches.
 */
function repoSkillCountSql(alias: string): string {
  return `(
    SELECT COUNT(*)
    FROM skills repo_skills
    WHERE repo_skills.owner = ${alias}.owner
      AND repo_skills.repo = ${alias}.repo
      AND repo_skills.source_resolved = 1
  ) AS repo_skill_count`
}

const SELECT_SKILL_ROW = `${SELECT_SKILL_ROW_BASE},
  ${repoSkillCountSql('s')}`
const SELECT_SKILL_ROW_WITH_BODY = `${SELECT_SKILL_ROW}, s.rendered_raw`

export interface RegistrySkill {
  name: string
  owner: string
  repo: string
  /** Final public route. Consumers must not rebuild it. */
  registryPath: string
  displayName: string
  slug: string
  stars: number
  likeCount: number
  description: string | null
  renderedRawSha256: string | null
  seoIndexScore: number
  seoIndexable: boolean
  trustTier: string
  trustScore: number
  pushedAt: number | null
  modifiedAt: number | null
  firstSeenAt: number | null
  /** GitHub profile name synced into `owners`; null until the owner page has been synced. */
  authorName?: string | null
  /** SKILL.md on GitHub at the synced revision, so every card can link the source. */
  skillFileUrl?: string | null
  dependencies?: string[]
  /**
   * Set on search results only. When the same skill is mirrored across repos
   * the group collapses to one canonical row; these describe the rest of the
   * group so the UI can offer "also in 2 other repos".
   */
  sourceCount?: number
  alternateSources?: AlternateSource[]
}

interface SkillRow {
  name: string
  owner: string
  repo: string
  repo_skill_count: number
  display_name: string
  slug: string
  stars: number | null
  like_count: number | null
  description: string | null
  rendered_raw_sha256: string | null
  seo_index_score: number | null
  seo_indexable: number | null
  trust_tier: string | null
  trust_score: number | null
  pushed_at: number | null
  modified_at: number | null
  first_seen_at: number | null
  rendered_skill_path: string | null
  current_sha: string | null
  default_branch: string | null
  source_owner: string | null
  source_repo: string | null
  author_name: string | null
  rendered_raw?: string | null
}

function rowToSkill(row: SkillRow): RegistrySkill {
  return {
    name: row.name,
    owner: row.owner,
    repo: row.repo,
    registryPath: canonicalRepoSkillPath({
      owner: row.owner,
      repo: row.repo,
      name: row.name,
      repoSkillCount: row.repo_skill_count,
    }),
    displayName: row.display_name,
    slug: row.slug,
    stars: row.stars ?? 0,
    likeCount: row.like_count ?? 0,
    description: row.description ?? null,
    renderedRawSha256: row.rendered_raw_sha256 ?? null,
    seoIndexScore: row.seo_index_score ?? 0,
    seoIndexable: row.seo_indexable === 1,
    trustTier: row.trust_tier ?? 'untrusted',
    trustScore: row.trust_score ?? 0,
    pushedAt: row.pushed_at ?? null,
    modifiedAt: row.modified_at ?? null,
    firstSeenAt: row.first_seen_at ?? null,
    authorName: row.author_name ?? null,
    skillFileUrl: githubSkillFileUrl({
      owner: row.source_owner || row.owner,
      repo: row.source_repo || row.repo,
      skillPath: row.rendered_skill_path,
      ref: row.current_sha || row.default_branch,
    }),
  }
}

function rowsToSkills(rows: SkillRow[], includeDependencies: boolean): RegistrySkill[] {
  if (!includeDependencies)
    return rows.map(rowToSkill)
  const dependencyMap = buildSkillDependencyMap(rows.map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    raw: row.rendered_raw ?? null,
  })))
  return rows.map(row => ({
    ...rowToSkill(row),
    dependencies: dependencyMap.get(skillDependencyKey(row.owner, row.repo, row.name)) ?? [],
  }))
}

export interface SkillsQuery {
  search?: string
  owner?: string
  official?: boolean
  excludeOfficial?: boolean
  supportedOnly?: boolean
  trustTier?: string
  category?: string
  tags?: string[]
  tagMode?: 'and' | 'or'
  sort?: 'stars' | 'name' | 'owner' | 'likes'
  uniqueOwners?: boolean
  page?: number
  limit?: number
  officialOwners?: Set<string>
  includeDependencies?: boolean
}

interface SkillsQueryResult {
  items: RegistrySkill[]
  total: number
  page: number
  pages: number
  facets: { owner: string, count: number }[]
  /** Which retrieval lanes served this query. Absent when not searching. */
  mode?: SearchMode
}

interface RepoRef {
  owner: string
  repo: string
}

const MAX_REPO_FILTER_REFS = 40

function repoPairFilter(repos: RepoRef[]): { sql: string, params: string[] } {
  return {
    sql: repos.map(() => '(s.owner = ? AND s.repo = ?)').join(' OR '),
    params: repos.flatMap(({ owner, repo }) => [owner, repo]),
  }
}

function chunkRepos(repos: RepoRef[]): RepoRef[][] {
  const chunks: RepoRef[][] = []
  for (let i = 0; i < repos.length; i += MAX_REPO_FILTER_REFS)
    chunks.push(repos.slice(i, i + MAX_REPO_FILTER_REFS))
  return chunks
}

function firstSkillPerOwner<T extends { skill: { owner: string } }>(groups: T[]): T[] {
  const owners = new Set<string>()
  return groups.filter((group) => {
    if (owners.has(group.skill.owner))
      return false
    owners.add(group.skill.owner)
    return true
  })
}

export async function querySkills(event: H3Event, opts: SkillsQuery): Promise<SkillsQueryResult> {
  const db = getDB(event)
  const { search, owner, official, excludeOfficial, supportedOnly, trustTier, category, tags, tagMode = 'and', sort = 'stars', uniqueOwners = false, page = 1, limit = 60, officialOwners, includeDependencies = false } = opts
  const selectSkillRow = includeDependencies ? SELECT_SKILL_ROW_WITH_BODY : SELECT_SKILL_ROW

  // Listings exclude skills whose source is unresolved or deleted upstream
  // (`source_resolved = 0`): their detail pages serve 410 tombstones
  // (server/middleware/skill-source-gone.ts), so linking them from a hub is a
  // self-inflicted broken internal link. Same convention as community,
  // homepage and collection queries. Tombstone pages load the skill directly,
  // not through this query.
  const conditions: string[] = [NOT_BROKEN_SQL, 's.source_resolved = 1']
  const params: (string | number)[] = []

  // Search: lexical (FTS5/BM25) and semantic (Vectorize) retrieval run in
  // parallel and are fused by reciprocal rank. Both lanes matter — skills
  // awaiting an embedding are only reachable lexically, and prose queries are
  // only reachable semantically.
  //
  // The candidate pool arrives as one JSON array parameter rather than one
  // bound param per hit, so the pool is no longer squeezed under D1's 100
  // SQL-variable cap. That cap is why `total`, `pages` and the owner facets
  // used to describe a 60-row sample instead of the real match set.
  let searchHits: HybridSearchResult | null = null
  if (search) {
    searchHits = await hybridSkillSearch(event, search)
    if (!searchHits.keys.length)
      return { items: [], total: 0, page, pages: 0, facets: [], mode: searchHits.mode }
    conditions.push(`(s.owner || '/' || s.repo || '/' || s.name) IN (SELECT value FROM json_each(?))`)
    params.push(JSON.stringify(searchHits.keys))
    // The skills table is already curated. Search also includes Skills
    // awaiting embeddings or indexability checks.
  }

  if (owner) {
    conditions.push('s.owner = ?')
    params.push(owner)
  }

  if (official && officialOwners?.size) {
    const placeholders = Array.from(officialOwners, () => '?').join(',')
    conditions.push(`s.owner IN (${placeholders})`)
    params.push(...officialOwners)
  }

  if (excludeOfficial && officialOwners?.size) {
    const placeholders = Array.from(officialOwners, () => '?').join(',')
    conditions.push(`s.owner NOT IN (${placeholders})`)
    params.push(...officialOwners)
  }

  if (supportedOnly)
    conditions.push(`(${SUPPORTED_SKILL_SQL})`)

  if (trustTier) {
    conditions.push('s.trust_tier = ?')
    params.push(trustTier)
  }

  if (category) {
    conditions.push('s.abstractness_category = ?')
    params.push(category)
  }

  if (tags?.length) {
    const tagsSubquery = () =>
      `EXISTS (SELECT 1 FROM skill_generated sg, json_each(sg.payload, '$.tags') je
        WHERE sg.owner = s.owner AND sg.repo = s.repo AND sg.name = s.name
          AND sg.kind = 'tags' AND je.value = ?)`
    if (tagMode === 'or') {
      conditions.push(`(${tags.map(tagsSubquery).join(' OR ')})`)
    }
    else {
      for (let i = 0; i < tags.length; i++)
        conditions.push(tagsSubquery())
    }
    params.push(...tags)
  }

  // Anonymous discovery (Loop 1) hides aggregators. Owner profiles, official
  // sections, and supported-only views show everything since the user already
  // chose a scope.
  const isAnonymousBrowse = !owner && !official && !supportedOnly
  if (isAnonymousBrowse)
    conditions.push(NOT_AGGREGATOR_SQL)

  const where = `WHERE ${conditions.join(' AND ')}`

  // Search path: the IN clause already bounds the row set to the fused
  // candidates, so we fetch it whole and rank, collapse and page in JS.
  if (searchHits) {
    const rows = await db
      .prepare(`SELECT ${selectSkillRow} ${FROM_SKILLS_JOIN_REPOS} ${where}`)
      .bind(...params)
      .all<SkillRow>()

    const ranked = rankSearchResults(rowsToSkills(rows.results ?? [], includeDependencies), searchHits.scoreByKey, search!)
    // Forked skill collections mirror the same SKILL.md under several owners.
    // Collapsing after ranking keeps each group at its best member's position.
    const collapsed = collapseSearchDuplicates(ranked, search!)

    const scoped = uniqueOwners ? firstSkillPerOwner(collapsed) : collapsed
    const total = scoped.length
    const start = (page - 1) * limit
    const facetCounts = new Map<string, number>()
    for (const group of scoped)
      facetCounts.set(group.skill.owner, (facetCounts.get(group.skill.owner) ?? 0) + 1)
    const facets = [...facetCounts.entries()]
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
      .slice(0, 20)

    return {
      items: scoped.slice(start, start + limit).map(group => ({
        ...group.skill,
        sourceCount: group.sourceCount,
        alternateSources: group.alternateSources,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
      facets,
      mode: searchHits.mode,
    }
  }

  // Sort
  let orderBy: string
  let rankedOrderBy: string
  if (sort === 'name') {
    [orderBy, rankedOrderBy] = ['s.name ASC', 'name ASC']
  }
  else if (sort === 'owner') {
    [orderBy, rankedOrderBy] = ['s.owner ASC, s.name ASC', 'owner ASC, name ASC']
  }
  // Opt-in only: stars stays the default order (ADR-0003). Stars break the tie
  // so a wall of zero-like skills still lands in a defensible sequence.
  else if (sort === 'likes') {
    [orderBy, rankedOrderBy] = [
      's.like_count DESC, r.stars DESC, s.owner ASC, s.repo ASC, s.name ASC',
      'like_count DESC, stars DESC, owner ASC, repo ASC, name ASC',
    ]
  }
  else {
    [orderBy, rankedOrderBy] = [
      'r.stars DESC, s.owner ASC, s.repo ASC, s.name ASC',
      'stars DESC, owner ASC, repo ASC, name ASC',
    ]
  }

  // Count and page the selected result grain: every skill, or one skill per owner.
  const countExpression = uniqueOwners ? 'COUNT(DISTINCT s.owner)' : 'COUNT(*)'
  const countStmt = db
    .prepare(`SELECT ${countExpression} as total ${FROM_SKILLS_JOIN_REPOS} ${where}`)
    .bind(...params)

  const offset = (page - 1) * limit
  // The repo Skill count is added after the page cut, so it runs once per row
  // on the page instead of once per match. The outer query sorts the page
  // again by the same key, which names result columns and binds nothing.
  const pageSelectRow = includeDependencies ? `${SELECT_SKILL_ROW_BASE}, s.rendered_raw` : SELECT_SKILL_ROW_BASE
  const dataStmt = db
    .prepare(uniqueOwners
      ? `WITH ranked_skills AS (
          SELECT ${pageSelectRow},
            ROW_NUMBER() OVER (PARTITION BY s.owner ORDER BY ${orderBy}) AS owner_rank
          ${FROM_SKILLS_JOIN_REPOS}
          ${where}
        )
        SELECT paged.*, ${repoSkillCountSql('paged')}
        FROM (
          SELECT * FROM ranked_skills
          WHERE owner_rank = 1
          ORDER BY ${rankedOrderBy}
          LIMIT ? OFFSET ?
        ) paged
        ORDER BY ${rankedOrderBy}`
      : `SELECT paged.*, ${repoSkillCountSql('paged')}
        FROM (
          SELECT ${pageSelectRow} ${FROM_SKILLS_JOIN_REPOS} ${where}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        ) paged
        ORDER BY ${rankedOrderBy}`)
    .bind(...params, limit, offset)

  // Facets: top owners from filtered results
  const facetStmt = db
    .prepare(`SELECT s.owner, COUNT(*) as count ${FROM_SKILLS_JOIN_REPOS} ${where} GROUP BY s.owner ORDER BY count DESC LIMIT 20`)
    .bind(...params)

  const [countResult, dataResult, facetResult] = await db.batch([
    countStmt,
    dataStmt,
    facetStmt,
  ])
  const countRes = countResult?.results[0] as { total: number } | undefined
  const dataRows = (dataResult?.results ?? []) as SkillRow[]
  const facets = (facetResult?.results ?? []) as { owner: string, count: number }[]

  return {
    items: rowsToSkills(dataRows, includeDependencies),
    total: countRes?.total ?? 0,
    page,
    pages: Math.ceil((countRes?.total ?? 0) / limit),
    facets,
  }
}

export interface SkillLookup {
  packageName: string
  owner?: string
}

/**
 * Resolve skill rows for a list of (packageName, owner?) pairs.
 * When owner is known, the exact (owner, name) row is returned. When owner
 * is missing (legacy collection entries), the highest-starred repository row
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
    .prepare(`SELECT ${SELECT_SKILL_ROW} ${FROM_SKILLS_JOIN_REPOS} WHERE s.name IN (${placeholders})${brokenClause}${supportedClause}`)
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
      : [...candidates].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.repo.localeCompare(b.repo))[0]
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
      `SELECT s.owner, COUNT(*) as count ${FROM_SKILLS_JOIN_REPOS}
       WHERE s.owner IN (${placeholders}) AND ${NOT_BROKEN_SQL}
       GROUP BY s.owner
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
        `SELECT s.owner, s.repo, COUNT(*) as count ${FROM_SKILLS_JOIN_REPOS}
         WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
         GROUP BY s.owner, s.repo
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
        `SELECT s.owner, s.repo, COUNT(*) as count, MAX(r.stars) as stars ${FROM_SKILLS_JOIN_REPOS}
         WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
         GROUP BY s.owner, s.repo
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
      `SELECT s.owner, COUNT(*) as count, MAX(r.stars) as stars ${FROM_SKILLS_JOIN_REPOS}
       WHERE s.owner IN (${placeholders}) AND ${NOT_BROKEN_SQL}
       GROUP BY s.owner
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
 * For each repository, return up to `perOrg` recently updated skills, plus its
 * total skill count. Order of returned sections matches
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

  // The repo Skill count is added after the `rn` cut. Inside the window select
  // it ran for every Skill of every featured repository: 1.24M rows read per
  // call on production data, against about 33K this way.
  const rankedStmt = db
    .prepare(
      `SELECT ranked.*, ${repoSkillCountSql('ranked')} FROM (
        SELECT ${SELECT_SKILL_ROW_BASE},
          ROW_NUMBER() OVER (PARTITION BY s.owner, s.repo ORDER BY s.modified_at DESC, s.name ASC) AS rn,
          COUNT(*) OVER (PARTITION BY s.owner, s.repo) AS repo_total
        ${FROM_SKILLS_JOIN_REPOS}
        WHERE (${filter.sql}) AND ${NOT_BROKEN_SQL}
      ) ranked WHERE rn <= ?`,
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
  /** Resolved-Skill total for the repo; 1 means the hub URL is canonical. */
  repoSkillCount: number
}

interface SkillDuplicateRow extends DuplicateCandidate {
  is_supported: number
  // Resolved-Skill total for the row's repository (same definition as
  // loadRepoSkillCounts in shared/server/trending-skills.ts). Drives the
  // single-Skill repo hub routing so links never point at a URL that 301s.
  repo_skill_count: number
}

export interface SkillDuplicateSibling {
  name: string
  owner: string
  repo: string
  displayName: string
  stars: number
  slug: string
  supportTier: string | null
  trustTier: string | null
  registryPath: string
}

export interface SkillDuplicateGroup {
  reason: DuplicateGroupReason
  canonical: SkillDuplicateSibling
  isCanonical: boolean
  siblings: SkillDuplicateSibling[]
}

function duplicateRowToSibling(row: SkillDuplicateRow): SkillDuplicateSibling {
  return {
    name: row.name,
    owner: row.owner,
    repo: row.repo,
    displayName: row.display_name,
    stars: row.stars ?? 0,
    slug: skillSlug(row),
    supportTier: row.support_tier,
    trustTier: row.trust_tier,
    registryPath: canonicalRepoSkillPath({
      owner: row.owner,
      repo: row.repo,
      name: row.name,
      repoSkillCount: row.repo_skill_count ?? 0,
    }),
  }
}

/**
 * Resolved-Skill total per repository, counted once per statement.
 *
 * The correlated form, `(SELECT COUNT(*) FROM skills WHERE owner/repo match)`
 * in the select list, reads every Skill of the repo for every outer row, so a
 * full listing reads sum(c^2) rows: about 585K per call in production, with one
 * repository at 875 Skills. Joining one grouped pass reads each Skill once.
 *
 * `repos.repo_skill_count` is not a substitute. Sync writes the number of
 * SKILL.md files in the tree, and the paths that clear `source_resolved` never
 * touch it; on 2026-09-14 it disagreed with this count for 7,159 of 8,618 repos.
 */
const REPO_SKILL_COUNTS_JOIN = `
  LEFT JOIN (
    SELECT owner, repo, COUNT(*) AS skill_count
    FROM skills
    WHERE source_resolved = 1
    GROUP BY owner, repo
  ) repo_counts ON repo_counts.owner = s.owner AND repo_counts.repo = s.repo`
const REPO_SKILL_COUNT_FROM_JOIN = 'COALESCE(repo_counts.skill_count, 0) AS repo_skill_count'

// Full-table scan of every indexable Skill. Cache the row set in KV so all
// concurrent skill detail / sitemap requests share one query within the TTL
// window instead of each one re-scanning. This was the dominant source of
// the 6.87B read figure on D1, and at a 5 minute TTL still read 792M rows over
// 1,347 calls between 11 and 13 Sep 2026. Duplicate groups and sitemap entries
// only move when a sync lands, so an hour fresh plus a day served stale while
// one refresh runs is well inside how often they change.
const DUPLICATE_CANDIDATES_TTL = 60 * 60
const DUPLICATE_CANDIDATES_STALE_TTL = 60 * 60 * 24

function listDuplicateCandidateRows(
  event: H3Event,
  opts: { supportedOnly: boolean, includeAggregators?: boolean },
): Promise<SkillDuplicateRow[]> {
  return cached({
    storage: useStorage('cache'),
    key: `skills:duplicate-candidates:v4:${opts.supportedOnly ? 'supported' : 'all'}:${opts.includeAggregators ? 'agg' : 'noagg'}`,
    ttlSeconds: DUPLICATE_CANDIDATES_TTL,
    staleSeconds: DUPLICATE_CANDIDATES_STALE_TTL,
    compute: () => queryDuplicateCandidateRows(event, opts),
    schedule: promise => runAfterResponse(event, promise),
  })
}

async function queryDuplicateCandidateRows(
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
        s.owner,
        s.repo,
        s.name,
        s.display_name,
        s.description,
        s.rendered_raw_sha256,
        r.stars,
        r.pushed_at,
        supported_repos.support_tier,
        s.trust_tier,
        ${supportedSelect} AS is_supported,
        ${REPO_SKILL_COUNT_FROM_JOIN}
      ${FROM_SKILLS_JOIN_REPOS}
      ${REPO_SKILL_COUNTS_JOIN}
      LEFT JOIN supported_repos
        ON supported_repos.owner = s.owner
        AND supported_repos.repo = s.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND s.seo_indexable = 1
        AND ${SKILL_ADMITTED_SQL}
        ${aggregatorFilter}
        ${supportedFilter}
      ORDER BY s.owner ASC, s.repo ASC, s.name ASC
    `)
    .all<SkillDuplicateRow>()
  return res.results ?? []
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

export function listAllSkillsForSitemap(event: H3Event): Promise<SkillSitemapEntry[]> {
  return cached({
    storage: useStorage('cache'),
    key: 'skills:sitemap-all:v4',
    ttlSeconds: DUPLICATE_CANDIDATES_TTL,
    staleSeconds: DUPLICATE_CANDIDATES_STALE_TTL,
    compute: () => queryAllSkillsForSitemap(getDB(event)),
    schedule: promise => runAfterResponse(event, promise),
  })
}

export async function queryAllSkillsForSitemap(db: D1Database): Promise<SkillSitemapEntry[]> {
  const res = await db
    .prepare(`
      SELECT
        s.name,
        s.owner,
        s.repo,
        s.display_name,
        s.description,
        s.rendered_raw_sha256,
        r.stars,
        r.pushed_at,
        supported_repos.support_tier,
        s.trust_tier,
        CASE WHEN (${SUPPORTED_SKILL_SQL}) THEN 1 ELSE 0 END AS is_supported,
        ${REPO_SKILL_COUNT_FROM_JOIN}
      ${FROM_SKILLS_JOIN_REPOS}
      ${REPO_SKILL_COUNTS_JOIN}
      LEFT JOIN supported_repos
        ON supported_repos.owner = s.owner
        AND supported_repos.repo = s.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND s.seo_indexable = 1
        AND ${SKILL_ADMITTED_SQL}
        AND ${NOT_AGGREGATOR_SQL}
      ORDER BY s.owner ASC, s.repo ASC, s.name ASC
    `)
    .all<SkillDuplicateRow>()
  const rows = res.results ?? []
  const weakerSlugs = duplicateWeakerSlugSet(rows)
  const entries = rows
    .filter(row => !weakerSlugs.has(skillSlug(row)))
    .map(row => ({ name: row.name, owner: row.owner, repo: row.repo, repoSkillCount: row.repo_skill_count ?? 0 }))
  return entries
}

export async function findRelatedSkills(
  event: H3Event,
  opts: { owner: string, repo: string, excludeName: string, limit?: number },
): Promise<{ sameRepo: RegistrySkill[], sameOwner: RegistrySkill[] }> {
  const db = getDB(event)
  const { owner, repo, excludeName, limit = 6 } = opts

  // The repo Skill count is added after the LIMIT, so it runs once per returned
  // row instead of once per match. This handler runs about 10K times a day.
  // Every same-repo row shares one repository, so that count binds the
  // repository directly and SQLite runs it once: on a 875-Skill repository the
  // read fell from 22.8K rows to 7K with the LIMIT, and to 2.6K with this.
  const [repoResult, ownerResult] = await db.batch([
    db
      .prepare(`SELECT paged.*, (
        SELECT COUNT(*)
        FROM skills repo_skills
        WHERE repo_skills.owner = ?1
          AND repo_skills.repo = ?2
          AND repo_skills.source_resolved = 1
      ) AS repo_skill_count FROM (
        SELECT ${SELECT_SKILL_ROW_BASE} ${FROM_SKILLS_JOIN_REPOS} WHERE s.owner = ?1 AND s.repo = ?2 AND s.name != ?3 AND s.source_resolved = 1 AND ${NOT_BROKEN_SQL} ORDER BY s.modified_at DESC, s.name ASC LIMIT ?4
      ) paged ORDER BY modified_at DESC, name ASC`)
      .bind(owner, repo, excludeName, limit),
    db
      .prepare(`SELECT paged.*, ${repoSkillCountSql('paged')} FROM (
        SELECT ${SELECT_SKILL_ROW_BASE} ${FROM_SKILLS_JOIN_REPOS} WHERE s.owner = ? AND NOT (s.repo = ?) AND s.name != ? AND s.source_resolved = 1 AND ${NOT_BROKEN_SQL} ORDER BY r.stars DESC, s.modified_at DESC, s.name ASC LIMIT ?
      ) paged ORDER BY stars DESC, modified_at DESC, name ASC`)
      .bind(owner, repo, excludeName, limit),
  ])
  const repoRows = (repoResult?.results ?? []) as SkillRow[]
  const ownerRows = (ownerResult?.results ?? []) as SkillRow[]

  return {
    sameRepo: repoRows.map(rowToSkill),
    sameOwner: ownerRows.map(rowToSkill),
  }
}

export async function findSkill(event: H3Event, slug: string): Promise<RegistrySkill | null> {
  return (await findSkillWithRow(event, slug, ''))?.skill ?? null
}

/**
 * Resolve a request slug to a Skill in one D1 read, plus any extra columns of
 * the same `skills s JOIN repos r` row the caller names in `extraColumnsSql`.
 * The detail route reads its whole row this way instead of looking the Skill
 * up and then reading the row again.
 *
 * `owner/repo/name` matches the primary key. Anything shorter matches
 * `skills.slug`, which is always `owner/name`: a three-part slug never matches
 * that column, so trying it first cost one wasted read per Skill page.
 */
export async function findSkillWithRow<Row extends object = object>(
  event: H3Event,
  slug: string,
  extraColumnsSql: string,
): Promise<{ skill: RegistrySkill, row: Row } | null> {
  const db = getDB(event)
  const select = `SELECT ${SELECT_SKILL_ROW}${extraColumnsSql ? `, ${extraColumnsSql}` : ''} ${FROM_SKILLS_JOIN_REPOS}`
  const parts = slug.split('/')
  const statement = parts.length >= 3
    ? db.prepare(`${select} WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
        .bind(parts[0], parts[1], parts.slice(2).join('/'))
    : db.prepare(`${select} WHERE s.slug = ?`).bind(slug)
  const row = await statement.first<SkillRow & Row>()
  return row ? { skill: rowToSkill(row), row } : null
}
