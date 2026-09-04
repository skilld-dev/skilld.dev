import type { H3Event } from 'h3'
import type { DuplicateCandidate, DuplicateGroupReason } from './skill-duplicate-canonical'
import type { AlternateSource, HybridSearchResult, SearchMode } from './skill-search'
import { getDB } from '#server/utils/db'
import { readCache, writeCache } from '#shared/server/cache'
import { githubSkillFileUrl } from '#shared/skill-file-url'
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

const NOT_BROKEN_SQL = notBrokenSql('r')
const NOT_AGGREGATOR_SQL = notAggregatorSql('r')
const FROM_SKILLS_JOIN_REPOS = `FROM skills s ${JOIN_REPOS_SQL}`
const SELECT_SKILL_ROW = `
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
  (SELECT o.name FROM owners o WHERE o.owner = s.owner) AS author_name,
  (
    SELECT COUNT(*)
    FROM skills repo_skills
    WHERE repo_skills.owner = s.owner
      AND repo_skills.repo = s.repo
      AND repo_skills.source_resolved = 1
  ) AS repo_skill_count`
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
    // Deliberately not gated on `seo_indexable`. The registry table is already
    // the curated corpus (5,669 rows, of which 5,255 are indexable), so the
    // lexical lane reaches only 414 skills the semantic lane cannot — which is
    // precisely the recall it was added for. Gating here would re-hide the
    // skills still waiting on an embedding.
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
    const collapsed = collapseSearchDuplicates(ranked)

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
  const dataStmt = db
    .prepare(uniqueOwners
      ? `WITH ranked_skills AS (
          SELECT ${selectSkillRow},
            ROW_NUMBER() OVER (PARTITION BY s.owner ORDER BY ${orderBy}) AS owner_rank
          ${FROM_SKILLS_JOIN_REPOS}
          ${where}
        )
        SELECT * FROM ranked_skills
        WHERE owner_rank = 1
        ORDER BY ${rankedOrderBy}
        LIMIT ? OFFSET ?`
      : `SELECT ${selectSkillRow} ${FROM_SKILLS_JOIN_REPOS} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
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

  const rankedStmt = db
    .prepare(
      `SELECT * FROM (
        SELECT ${SELECT_SKILL_ROW},
          ROW_NUMBER() OVER (PARTITION BY s.owner, s.repo ORDER BY s.modified_at DESC, s.name ASC) AS rn,
          COUNT(*) OVER (PARTITION BY s.owner, s.repo) AS repo_total
        ${FROM_SKILLS_JOIN_REPOS}
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

// Full-table scan: ~1.4k row reads per call. Cache the row set in KV so all
// concurrent skill detail / sitemap requests share one query within the TTL
// window instead of each one re-scanning. This was the dominant source of
// the 6.87B read figure on D1.
const DUPLICATE_CANDIDATES_TTL = 60 * 5

async function listDuplicateCandidateRows(
  event: H3Event,
  opts: { supportedOnly: boolean, includeAggregators?: boolean },
): Promise<SkillDuplicateRow[]> {
  const cacheKey = `skills:duplicate-candidates:v2:${opts.supportedOnly ? 'supported' : 'all'}:${opts.includeAggregators ? 'agg' : 'noagg'}`
  const cached = await readCache<SkillDuplicateRow[]>(useStorage('cache'), cacheKey)
  if (cached)
    return cached

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
        (
          SELECT COUNT(*)
          FROM skills rc
          WHERE rc.owner = s.owner AND rc.repo = s.repo AND rc.source_resolved = 1
        ) AS repo_skill_count
      ${FROM_SKILLS_JOIN_REPOS}
      LEFT JOIN supported_repos
        ON supported_repos.owner = s.owner
        AND supported_repos.repo = s.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND s.seo_indexable = 1
        ${aggregatorFilter}
        ${supportedFilter}
      ORDER BY s.owner ASC, s.repo ASC, s.name ASC
    `)
    .all<SkillDuplicateRow>()
  const rows = res.results ?? []
  await writeCache(useStorage('cache'), cacheKey, rows, { ttl: DUPLICATE_CANDIDATES_TTL })
  return rows
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
  const cacheKey = 'skills:sitemap-all:v2'
  const cached = await readCache<SkillSitemapEntry[]>(useStorage('cache'), cacheKey)
  if (cached)
    return cached

  const db = getDB(event)
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
        (
          SELECT COUNT(*)
          FROM skills rc
          WHERE rc.owner = s.owner AND rc.repo = s.repo AND rc.source_resolved = 1
        ) AS repo_skill_count
      ${FROM_SKILLS_JOIN_REPOS}
      LEFT JOIN supported_repos
        ON supported_repos.owner = s.owner
        AND supported_repos.repo = s.repo
        AND supported_repos.enabled = 1
      WHERE ${NOT_BROKEN_SQL}
        AND s.seo_indexable = 1
        AND ${NOT_AGGREGATOR_SQL}
      ORDER BY s.owner ASC, s.repo ASC, s.name ASC
    `)
    .all<SkillDuplicateRow>()
  const rows = res.results ?? []
  const weakerSupportedSlugs = duplicateWeakerSlugSet(rows.filter(row => row.is_supported === 1))
  const entries = rows
    .filter(row => !weakerSupportedSlugs.has(skillSlug(row)))
    .map(row => ({ name: row.name, owner: row.owner, repo: row.repo, repoSkillCount: row.repo_skill_count ?? 0 }))
  await writeCache(useStorage('cache'), cacheKey, entries, { ttl: DUPLICATE_CANDIDATES_TTL })
  return entries
}

export async function listSupportedSkillsForSitemap(event: H3Event): Promise<SkillSitemapEntry[]> {
  const rows = await listDuplicateCandidateRows(event, { supportedOnly: true })
  const weakerSlugs = duplicateWeakerSlugSet(rows)
  return rows
    .filter(row => !weakerSlugs.has(skillSlug(row)))
    .map(row => ({ name: row.name, owner: row.owner, repo: row.repo, repoSkillCount: row.repo_skill_count ?? 0 }))
}

export async function findRelatedSkills(
  event: H3Event,
  opts: { owner: string, repo: string, excludeName: string, limit?: number },
): Promise<{ sameRepo: RegistrySkill[], sameOwner: RegistrySkill[] }> {
  const db = getDB(event)
  const { owner, repo, excludeName, limit = 6 } = opts

  const [repoResult, ownerResult] = await db.batch([
    db
      .prepare(`SELECT ${SELECT_SKILL_ROW} ${FROM_SKILLS_JOIN_REPOS} WHERE s.owner = ? AND s.repo = ? AND s.name != ? AND ${NOT_BROKEN_SQL} ORDER BY s.modified_at DESC, s.name ASC LIMIT ?`)
      .bind(owner, repo, excludeName, limit),
    db
      .prepare(`SELECT ${SELECT_SKILL_ROW} ${FROM_SKILLS_JOIN_REPOS} WHERE s.owner = ? AND NOT (s.repo = ?) AND s.name != ? AND ${NOT_BROKEN_SQL} ORDER BY r.stars DESC, s.modified_at DESC, s.name ASC LIMIT ?`)
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
  const db = getDB(event)
  const row = await db
    .prepare(`SELECT ${SELECT_SKILL_ROW} ${FROM_SKILLS_JOIN_REPOS} WHERE s.slug = ?`)
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
        .prepare(`SELECT ${SELECT_SKILL_ROW} ${FROM_SKILLS_JOIN_REPOS} WHERE s.owner = ? AND s.repo = ? AND s.name = ?`)
        .bind(owner, repo, name)
        .first<SkillRow>()
      return altRow ? rowToSkill(altRow) : null
    }
    return null
  }
  return rowToSkill(row)
}
