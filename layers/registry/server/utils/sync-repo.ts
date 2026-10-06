/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings, RepoMeta } from './github-client'
import type { SkillTrustTier } from './skill-trust'
import { isRegistrySkillPath, isSkilldCacheSkill } from '#shared/skill-path'
import { isCategoryPinned } from '../data/clusters'
import { getBlobsBatch, getCommitsBatch, getRepoSummary, getTree, logRateLimit } from './github-client'
import { repoStarObservationStatements } from './repo-history'
import { resolveRepoSourceIdentityFromRow } from './repo-source-identity'
import { skillContentSha256 } from './skill-content-hash'
import { parseSkillFile } from './skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from './skill-indexability'
import { parseSkillMd } from './skill-md-render'
import { resolveSkillTrust } from './skill-trust'

export interface SyncRepoStats {
  owner: string
  repo: string
  status: 'indexed' | 'continuing' | 'restart-required' | 'verified-only' | 'rejected' | 'skipped-pushed-at' | 'skipped-tree-sha' | 'failed' | 'rate-limited' | 'unauthorized'
  reason?: string
  skillsSeen: number
  skillsUpserted: number
  /** Files present upstream that GitHub will not return as text. */
  skillsUnreadable: number
  revisionsInserted: number
  activityEmitted: number
  rateLimitRemaining?: number
  /** The GitHub bucket `rateLimitRemaining` counts: `core` or `graphql`. */
  rateLimitResource?: string
  rateLimitResetAt?: number
  continuation?: SyncRepoContinuation
}

export interface SyncRepoContinuation {
  treeSha: string
  checkedAt: number
  nextOffset: number
}

interface ExistingSkill {
  name: string
  current_sha: string | null
  modified_at: number | null
  first_seen_at: number | null
  last_synced_at: number | null
  references_count: number
  rendered_skill_path: string | null
  rendered_status: string | null
  owner_verified: number
}

interface ExistingSkillAssets {
  name: string
  assets: string
}

export interface ExistingRepo {
  last_tree_sha: string | null
  pushed_at: number | null
  source_owner: string | null
  source_repo: string | null
}

export type RefreshRepoAssetsResult
  = | {
    _tag: 'refreshed'
    owner: string
    repo: string
    skillsSeen: number
    skillsChanged: number
    pathsMissing: number
    rateLimitRemaining?: number
    rateLimitResetAt?: number
  }
  | {
    _tag: 'failed'
    owner: string
    repo: string
    reason: string
    retryable: boolean
    rateLimited: boolean
    unauthorized: boolean
    rateLimitRemaining?: number
    rateLimitResetAt?: number
  }

const SKILL_FILE_SUFFIX = '/SKILL.md'
const FIRST_SYNC_COMMIT_CAP = 30

/**
 * Skills fetched, rendered, and written per pass.
 *
 * Chunking the batched GraphQL query bounded the *request* but every chunk was
 * merged into one repo-wide Map, so a repo with ~900 skills still materialised
 * every SKILL.md, its commit history, and its rendered HTML at once. On
 * 2026-07-26 that killed the isolate with exceededMemory on every hourly tick.
 * Slicing bounds the working set by this constant instead of by repo size.
 *
 * Kept at the GraphQL batch ceiling so one slice is still one blob request and
 * one commit request. Raising it re-inflates the peak; lowering it costs
 * requests without lowering the peak below one alias batch.
 */
export const SKILL_SLICE_SIZE = 50

/**
 * D1 limits one row to 2,000,000 bytes while Worker RPC values cap at 32 MiB.
 * Fifteen worst-case rows remain below that serialization boundary, including
 * enough headroom for result metadata.
 */
export const EXISTING_SKILL_ASSET_CHUNK = 15

/**
 * Character budget for one `db.batch()` call.
 *
 * The 2026-08-10 chunking bounded `loadExistingSkillAssets`, which reads a small
 * column, and left the actual overflow untouched: the slice batch binds
 * `rendered_raw` and `rendered_html` for every admitted skill at once, so its
 * size tracks skill *content*, not skill count. `garrytan/gstack` holds 58
 * skills averaging 192 KB of rendered HTML, and one 50-skill slice serialized to
 * 48,516,427 bytes against a 32 MiB ceiling, failing on every hourly tick from
 * 2026-08-10T04:17Z onward.
 *
 * Bounding by count cannot fix this, because one skill's content is unbounded.
 * The budget is in characters, and the measured production ratio was 48,516,427
 * serialized bytes for roughly 12.4M bound characters, near 3.9 bytes per
 * character once escaping is counted. Eight million characters therefore lands
 * around 31 MB, under the ceiling with room for statement text and metadata.
 */
export const D1_BATCH_CHAR_BUDGET = 8_000_000

/** A prepared write and the bound payload size that decides which batch it joins. */
export interface WeightedWrite {
  statement: D1PreparedStatement
  chars: number
}

/**
 * Bind a statement and measure it in the same step.
 *
 * Returning the pair together is what keeps an unmeasured statement out of the
 * queue: there is no way to push a write without its weight.
 */
export function weighWrite(db: D1Database, sql: string, params: unknown[]): WeightedWrite {
  let chars = sql.length
  for (const param of params) {
    // Only strings can carry unbounded payload; numbers and nulls are noise.
    chars += typeof param === 'string' ? param.length : 8
  }
  return { statement: db.prepare(sql).bind(...params), chars }
}

/**
 * Split writes into contiguous groups that each stay inside the budget.
 *
 * Contiguous is enough because every write in the slice batch is idempotent (an
 * upsert, an `INSERT OR IGNORE`, or a `NOT EXISTS` guard), which is the same
 * property that already lets a run die mid-repo and be replayed. Splitting
 * therefore costs atomicity that was never relied on.
 *
 * A single write heavier than the whole budget still gets its own group. It
 * cannot be split further, and refusing it would strand the repository forever
 * rather than failing one oversized skill.
 */
export function planWriteBatches(weights: number[], budget: number = D1_BATCH_CHAR_BUDGET): number[][] {
  const groups: number[][] = []
  let current: number[] = []
  let running = 0
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index] ?? 0
    if (current.length > 0 && running + weight > budget) {
      groups.push(current)
      current = []
      running = 0
    }
    current.push(index)
    running += weight
  }
  if (current.length > 0)
    groups.push(current)
  return groups
}

/**
 * Run weighted writes as one or more batches, returning results in input order.
 *
 * Callers index the result array by the position they pushed at
 * (`revisionWriteIndexes`, `activityWriteIndexes`), so the split has to be
 * invisible to them or the change-count accounting silently reads the wrong row.
 */
export async function runBoundedBatch(
  db: D1Database,
  writes: WeightedWrite[],
  budget: number = D1_BATCH_CHAR_BUDGET,
): Promise<D1Result[]> {
  const results: D1Result[] = Array.from({ length: writes.length })
  for (const group of planWriteBatches(writes.map(write => write.chars), budget)) {
    const batch = await db.batch(group.map(index => writes[index]!.statement))
    group.forEach((index, position) => {
      results[index] = batch[position]!
    })
  }
  return results
}

function slices<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function epoch(iso: string | null | undefined): number | null {
  return iso ? Math.floor(new Date(iso).getTime() / 1000) : null
}

function dirNameFromSkillPath(path: string): string | null {
  if (!path.endsWith('SKILL.md'))
    return null
  const segments = path.split('/')
  if (segments.length < 2)
    return null
  return segments[segments.length - 2] ?? null
}

interface SkillAsset {
  path: string
  size: number
  type: 'markdown' | 'code' | 'image' | 'data' | 'other'
}

function classifyAsset(path: string): SkillAsset['type'] {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  if (ext === 'md' || ext === 'markdown')
    return 'markdown'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'image'
  if (['json', 'yaml', 'yml', 'toml', 'csv'].includes(ext))
    return 'data'
  if (['py', 'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'sh', 'bash', 'zsh', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'lua', 'sql'].includes(ext))
    return 'code'
  return 'other'
}

const ASSET_IGNORE = /(?:^|\/)(?:LICENSE(?:\.[^/]+)?|\.DS_Store|\.gitignore|\.gitattributes)$/i

/**
 * Bucket a repo's blobs by the skill directories that own them, in one pass.
 *
 * The previous per-skill scan walked the whole tree once per SKILL.md, and it
 * was handed `dirName` (the bare directory name) where a path prefix was
 * needed. A skill at `skills/one/SKILL.md` has dirName `one`, which never
 * prefixes `skills/one/reference.md`, so nested skills recorded no references
 * at all while a top-level directory that happened to share the name donated
 * its files instead.
 *
 * Called per slice, so the map stays bounded like the rest of the working set.
 */
function collectAssetsByDir(
  tree: { path: string, type: string, size?: number }[],
  skillDirs: Set<string>,
): Map<string, SkillAsset[]> {
  const byDir = new Map<string, SkillAsset[]>()
  for (const dir of skillDirs)
    byDir.set(dir, [])
  for (const e of tree) {
    if (e.type !== 'blob')
      continue
    // An asset belongs to every skill directory above it, which keeps the
    // prefix semantics intact when skills nest inside one another.
    for (let slash = e.path.indexOf('/'); slash !== -1; slash = e.path.indexOf('/', slash + 1)) {
      const bucket = byDir.get(e.path.slice(0, slash))
      if (!bucket)
        continue
      const rel = e.path.slice(slash + 1)
      if (!rel || rel === 'SKILL.md' || ASSET_IGNORE.test(rel))
        continue
      bucket.push({ path: rel, size: e.size ?? 0, type: classifyAsset(rel) })
    }
  }
  for (const assets of byDir.values())
    assets.sort((a, b) => a.path.localeCompare(b.path))
  return byDir
}

export async function loadExistingSkillSummaries(
  db: D1Database,
  owner: string,
  repo: string,
): Promise<Map<string, ExistingSkill>> {
  const res = await db
    .prepare(
      `SELECT name, current_sha, modified_at, first_seen_at, last_synced_at,
              references_count, rendered_skill_path, rendered_status,
              owner_verified
       FROM skills WHERE owner = ? AND repo = ?`,
    )
    .bind(owner, repo)
    .all<ExistingSkill>()
  const map = new Map<string, ExistingSkill>()
  for (const row of res.results ?? [])
    map.set(row.name, row)
  return map
}

export async function loadExistingSkillAssets(
  db: D1Database,
  owner: string,
  repo: string,
  names: string[],
): Promise<ExistingSkillAssets[]> {
  const uniqueNames = [...new Set(names)]
  const rows: ExistingSkillAssets[] = []
  for (const chunk of slices(uniqueNames, EXISTING_SKILL_ASSET_CHUNK)) {
    const placeholders = chunk.map(() => '?').join(', ')
    const result = await db.prepare(
      `SELECT name, assets
       FROM skills
       WHERE owner = ? AND repo = ? AND name IN (${placeholders})`,
    ).bind(owner, repo, ...chunk).all<ExistingSkillAssets>()
    rows.push(...(result.results ?? []))
  }
  return rows
}

export async function refreshRepoAssets(
  owner: string,
  repo: string,
  bindings: GithubBindings,
  db: D1Database,
): Promise<RefreshRepoAssetsResult> {
  const existingRepo = await loadExistingRepo(db, owner, repo)
  const requestSource = resolveRepoSourceIdentityFromRow({ owner, repo }, existingRepo)
  const repoRes = await getRepoSummary(requestSource.owner, requestSource.repo, bindings)
  logRateLimit(`asset-backfill repo ${owner}/${repo}`, repoRes.rateLimit)
  const rate: Pick<SyncRepoStats, 'rateLimitRemaining' | 'rateLimitResetAt'> = {
    ...(repoRes.rateLimit ? { rateLimitRemaining: repoRes.rateLimit.remaining, rateLimitResetAt: repoRes.rateLimit.reset } : {}),
  }
  if (!repoRes.data) {
    return {
      _tag: 'failed',
      owner,
      repo,
      reason: `repo fetch ${repoRes.status}`,
      retryable: repoRes.status === 403 || repoRes.status === 429 || repoRes.status >= 500,
      rateLimited: repoRes.status === 403 || repoRes.status === 429,
      unauthorized: repoRes.status === 401,
      ...rate,
    }
  }

  const branch = repoRes.data.meta.default_branch || 'main'
  const sourceOwner = repoRes.data.meta.owner.login
  const sourceRepo = repoRes.data.meta.name
  await db.prepare(`
    UPDATE repos
    SET source_owner = ?, source_repo = ?
    WHERE owner = ? AND repo = ?
  `).bind(sourceOwner, sourceRepo, owner, repo).run()
  const treeRes = await getTree(sourceOwner, sourceRepo, repoRes.data.headTreeSha ?? branch, bindings)
  logRateLimit(`asset-backfill tree ${owner}/${repo}`, treeRes.rateLimit)
  const rateLimitRemaining = Math.min(
    rate.rateLimitRemaining ?? Number.POSITIVE_INFINITY,
    treeRes.rateLimit?.remaining ?? Number.POSITIVE_INFINITY,
  )
  const rateLimitResetAt = Math.max(rate.rateLimitResetAt ?? 0, treeRes.rateLimit?.reset ?? 0)
  const finalRate = {
    ...(Number.isFinite(rateLimitRemaining) ? { rateLimitRemaining } : {}),
    ...(rateLimitResetAt > 0 ? { rateLimitResetAt } : {}),
  }
  if (!treeRes.data) {
    return {
      _tag: 'failed',
      owner,
      repo,
      reason: `tree fetch ${treeRes.status}`,
      retryable: treeRes.status === 403 || treeRes.status === 429 || treeRes.status >= 500,
      rateLimited: treeRes.status === 403 || treeRes.status === 429,
      unauthorized: treeRes.status === 401,
      ...finalRate,
    }
  }
  if (treeRes.data.truncated) {
    return {
      _tag: 'failed',
      owner,
      repo,
      reason: 'tree truncated',
      retryable: false,
      rateLimited: false,
      unauthorized: false,
      ...finalRate,
    }
  }

  const existing = [...(await loadExistingSkillSummaries(db, owner, repo)).values()]
  const skillPaths = new Set(
    treeRes.data.tree
      .filter(entry => entry.type === 'blob' && isRegistrySkillPath(entry.path))
      .map(entry => entry.path),
  )
  let skillsChanged = 0
  let pathsMissing = 0
  const now = nowSec()

  for (const slice of slices(existing, SKILL_SLICE_SIZE)) {
    const existingAssets = new Map(
      (await loadExistingSkillAssets(db, owner, repo, slice.map(skill => skill.name)))
        .map(skill => [skill.name, skill.assets]),
    )
    const withPath = slice.flatMap((skill) => {
      const path = skill.rendered_skill_path
      if (!path || !skillPaths.has(path)) {
        pathsMissing += 1
        return []
      }
      return [{ skill, dirPath: path.slice(0, -SKILL_FILE_SUFFIX.length) }]
    })
    const assetsByDir = collectAssetsByDir(treeRes.data.tree, new Set(withPath.map(item => item.dirPath)))
    const writes: D1PreparedStatement[] = []
    for (const { skill, dirPath } of withPath) {
      const assets = assetsByDir.get(dirPath) ?? []
      const assetsJson = JSON.stringify(assets)
      if (skill.references_count === assets.length && existingAssets.get(skill.name) === assetsJson)
        continue
      skillsChanged += 1
      writes.push(db.prepare(
        `UPDATE skills
         SET references_count = ?, assets = ?
         WHERE owner = ? AND repo = ? AND name = ?`,
      ).bind(assets.length, assetsJson, owner, repo, skill.name))
      writes.push(db.prepare(
        `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
         VALUES (?, ?, ?, 'references_changed', ?, 0)
         ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
           queued_at = excluded.queued_at,
           attempts = 0`,
      ).bind(owner, repo, skill.name, now))
    }
    if (writes.length > 0)
      await db.batch(writes)
  }

  return {
    _tag: 'refreshed',
    owner,
    repo,
    skillsSeen: existing.length,
    skillsChanged,
    pathsMissing,
    ...finalRate,
  }
}

async function loadExistingRepo(db: D1Database, owner: string, repo: string): Promise<ExistingRepo | null> {
  return await db
    .prepare(`
      SELECT last_tree_sha, pushed_at, source_owner, source_repo
      FROM repos
      WHERE owner = ? AND repo = ?
    `)
    .bind(owner, repo)
    .first<ExistingRepo>()
}

/**
 * Record a successful GitHub metadata check when content did not change.
 * This is the scheduler's repo-level freshness cursor and also keeps cheap
 * metadata current without rewriting every skill row in the repo.
 */
function markRepoSummaryCheckedStatement(
  db: D1Database,
  owner: string,
  repo: string,
  meta: RepoMeta,
  pushedAt: number | null,
  checkedAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE repos
       SET default_branch = ?,
           stars = ?,
           forks = ?,
           description = ?,
           pushed_at = ?,
           repo_created_at = ?,
           repo_meta_synced_at = ?,
           broken_since = NULL,
           tree_truncated_at = NULL,
           source_owner = ?,
           source_repo = ?
       WHERE owner = ? AND repo = ?`,
    )
    .bind(
      meta.default_branch || 'main',
      meta.stargazers_count ?? 0,
      meta.forks_count ?? 0,
      meta.description?.trim() || null,
      pushedAt,
      epoch(meta.created_at),
      checkedAt,
      meta.owner.login,
      meta.name,
      owner,
      repo,
    )
}

async function repoHasAdmittedSkills(db: D1Database, owner: string, repo: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS admitted FROM skills WHERE owner = ? AND repo = ? LIMIT 1`)
    .bind(owner, repo)
    .first<{ admitted: number }>()
  return row?.admitted === 1
}

/**
 * Why a repository needs no content sync this hour, or null when it does.
 *
 * Only a repository with admitted Skills qualifies: a Skill-less candidate is
 * still being discovered, so its tree must be read whatever the cursor says.
 */
export function unchangedRepoStatus(input: {
  existing: ExistingRepo | null
  hasAdmittedSkills: boolean
  headTreeSha: string | null
  repoPushedAt: number | null
}): 'skipped-tree-sha' | 'skipped-pushed-at' | null {
  const { existing, hasAdmittedSkills, headTreeSha, repoPushedAt } = input
  if (!hasAdmittedSkills || !existing?.last_tree_sha)
    return null
  if (headTreeSha && existing.last_tree_sha === headTreeSha)
    return 'skipped-tree-sha'
  if (existing.pushed_at != null && repoPushedAt != null && existing.pushed_at >= repoPushedAt)
    return 'skipped-pushed-at'
  return null
}

/**
 * The writes that record an unchanged repository: fresh metadata, the
 * freshness cursor, the day's star count and, for an owner-verified repository,
 * the verified flag on every Skill.
 */
export function repoUnchangedStatements(
  db: D1Database,
  input: {
    owner: string
    repo: string
    meta: RepoMeta
    checkedAt: number
    ownerVerified: boolean
  },
): D1PreparedStatement[] {
  const { owner, repo, meta, checkedAt } = input
  const pushedAt = epoch(meta.pushed_at)
  const statements = [
    markRepoSummaryCheckedStatement(db, owner, repo, meta, pushedAt, checkedAt),
    clearRepoMissingSkillsStatement(db, owner, repo, checkedAt),
    ...repoStarObservationStatements(db, owner, repo, meta.stargazers_count ?? 0, checkedAt),
  ]
  return input.ownerVerified
    ? [...statements, ...ownerVerifiedStatements(db, owner, repo, checkedAt)]
    : statements
}

function ownerVerifiedStatements(
  db: D1Database,
  owner: string,
  repo: string,
  checkedAt: number,
): D1PreparedStatement[] {
  return [
    db.prepare(
      `UPDATE skills
       SET owner_verified = 1
       WHERE owner = ? AND repo = ?`,
    ).bind(owner, repo),
    db.prepare(
      `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
       SELECT owner, repo, name, 'owner_verified', ?, 0
       FROM skills
       WHERE owner = ? AND repo = ?
       ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
         queued_at = excluded.queued_at,
         attempts = 0`,
    ).bind(checkedAt, owner, repo),
  ]
}

/**
 * Record that this repository's tree response is too large for the GitHub API
 * and will truncate on every attempt. Advancing the freshness cursor mirrors
 * markRepoMissing: the repository was checked, the check has an outcome, and
 * integrity views should not flag it as overdue. sync-candidates skips rows
 * carrying this verdict, and every successful repo write below clears it, so
 * a repo that becomes fetchable re-enters the normal freshness cycle.
 */
async function markRepoTooLarge(db: D1Database, owner: string, repo: string, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE repos
       SET tree_truncated_at = COALESCE(tree_truncated_at, ?),
           repo_meta_synced_at = ?
       WHERE owner = ? AND repo = ?`,
    )
    .bind(now, now, owner, repo)
    .run()
}

/**
 * Quarantine every skill of a repository GitHub answered 404/410 for.
 * `path_missing` rows are deliberately left alone: their files were already
 * gone while the repo was healthy, and overwriting them here would let the
 * unchanged-path recovery below resurrect skills the tree itself dropped.
 */
async function markRepoMissing(db: D1Database, owner: string, repo: string, now: number): Promise<void> {
  await Promise.all([
    db
      .prepare(
        `UPDATE repos
         SET broken_since = COALESCE(broken_since, ?),
             repo_meta_synced_at = ?
         WHERE owner = ? AND repo = ?`,
      )
      .bind(now, now, owner, repo)
      .run(),
    db
      .prepare(
        `UPDATE skills
         SET source_resolved = 0,
             last_synced_at = ?,
             sync_status = 'repo_missing',
             seo_indexable = 0,
             seo_index_score = MIN(seo_index_score, 0),
             seo_index_reasons = '["source_missing"]',
             seo_index_synced_at = ?,
             trust_tier = 'quarantined',
             trust_source = 'computed',
             trust_score = -50,
             trust_reasons = '["source_missing"]',
             trust_synced_at = ?
         WHERE owner = ? AND repo = ?
           AND (sync_status IS NULL OR sync_status != 'path_missing')`,
      )
      .bind(now, now, now, owner, repo)
      .run(),
  ])
}

/**
 * The flip side of markRepoMissing: a repo that re-verifies as reachable must
 * release the skills its missing verdict quarantined, or they stay stranded —
 * the unchanged paths only write the repos row, and the score recompute
 * treats any non-ok sync_status as unresolved, so quarantine would outlive
 * the outage forever. Only `repo_missing` rows flip, and only the fields the
 * missing verdict wrote; the daily score recompute lifts the remaining seo
 * and trust quarantine once this lands. Runs in the same batch as the repos
 * row, so repo recovery and skill recovery commit together.
 */
function clearRepoMissingSkillsStatement(
  db: D1Database,
  owner: string,
  repo: string,
  checkedAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE skills
       SET source_resolved = 1,
           last_synced_at = ?,
           sync_status = 'ok'
       WHERE owner = ? AND repo = ? AND sync_status = 'repo_missing'`,
    )
    .bind(checkedAt, owner, repo)
}

interface SkillSnapshot {
  path: string
  /** Bare directory name, the fallback for a skill's declared name. */
  dirName: string
  /** Full directory path, the prefix every asset of this skill shares. */
  dirPath: string
  treeSha: string
}

interface RepoTrustOverrideRow {
  tier: SkillTrustTier
  reason: string | null
}

async function getRepoTrustOverride(db: D1Database, owner: string, repo: string): Promise<RepoTrustOverrideRow | null> {
  return await db
    .prepare('SELECT tier, reason FROM repo_trust_overrides WHERE owner = ? AND repo = ?')
    .bind(owner, repo)
    .first<RepoTrustOverrideRow>()
}

type RepoKind = 'creator' | 'catalog' | 'aggregator'

async function getRepoKindOverride(db: D1Database, owner: string, repo: string): Promise<RepoKind | null> {
  const row = await db
    .prepare('SELECT kind FROM repo_kind_overrides WHERE owner = ? AND repo = ?')
    .bind(owner, repo)
    .first<{ kind: RepoKind }>()
  return row?.kind ?? null
}

async function hasEligibleReview(db: D1Database, owner: string, repo: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS present FROM skill_repo_eligibility WHERE owner = ? AND repo = ? AND status = 'eligible'`)
    .bind(owner, repo)
    .first<{ present: number }>()
  return row !== null
}

function classifyRepoKind(skillCount: number): RepoKind {
  if (skillCount > 100)
    return 'aggregator'
  if (skillCount > 5)
    return 'catalog'
  return 'creator'
}

export interface SyncRepoOptions {
  /**
   * Skill is being synced from a repo owned by an authenticated GitHub user.
   * Admits new skills past the indexable-only ingestion gate and marks them
   * owner-verified (a primary trust signal → indexable by default).
   */
  ownerVerified?: boolean
  /**
   * Admit new skills requested through the public repository URL flow without
   * claiming that the GitHub owner is verified. Trust and SEO remain computed.
   */
  submitted?: boolean
  /**
   * Bypass repo and per-skill content cursors. Used by rendered-content repair,
   * where an unchanged Git tree still needs a fresh render.
   */
  forceContent?: boolean
  /**
   * Resume a large repository from a durable checkpoint. The tree snapshot and
   * check timestamp keep final cursor and quarantine decisions atomic across
   * multiple Worker invocations.
   */
  continuation?: SyncRepoContinuation
  /**
   * Maximum SKILL.md paths to inspect in this invocation. Omit for the
   * synchronous full-repo behavior used outside durable jobs.
   */
  maxSkillFiles?: number
}

export async function syncRepo(
  owner: string,
  repo: string,
  bindings: GithubBindings,
  db: D1Database,
  opts: SyncRepoOptions = {},
): Promise<SyncRepoStats> {
  const stats: SyncRepoStats = {
    owner,
    repo,
    status: 'failed',
    skillsSeen: 0,
    skillsUpserted: 0,
    skillsUnreadable: 0,
    revisionsInserted: 0,
    activityEmitted: 0,
  }
  const trackRateLimit = (rateLimit: { remaining: number, reset: number, resource: string | null } | null): void => {
    if (!rateLimit)
      return
    if (stats.rateLimitRemaining == null || rateLimit.remaining < stats.rateLimitRemaining) {
      stats.rateLimitRemaining = rateLimit.remaining
      stats.rateLimitResource = rateLimit.resource ?? undefined
    }
    stats.rateLimitResetAt = Math.max(stats.rateLimitResetAt ?? 0, rateLimit.reset)
  }

  const existingRepo = await loadExistingRepo(db, owner, repo)
  const requestSource = resolveRepoSourceIdentityFromRow({ owner, repo }, existingRepo)
  const repoRes = await getRepoSummary(requestSource.owner, requestSource.repo, bindings)
  logRateLimit(`repo ${owner}/${repo}`, repoRes.rateLimit)
  trackRateLimit(repoRes.rateLimit)

  // A 401 is the credential, not the repository. Reporting it per repo made an
  // expired GITHUB_TOKEN look like ten unrelated repo failures that repeated
  // every hour, so it gets its own status the caller can bail on.
  if (repoRes.status === 401) {
    stats.status = 'unauthorized'
    stats.reason = 'github credential rejected (401)'
    return stats
  }

  if (repoRes.status === 403 || repoRes.status === 429) {
    stats.status = 'rate-limited'
    stats.reason = `rate-limited (${repoRes.rateLimit?.remaining ?? '?'} remaining)`
    return stats
  }

  if (!repoRes.data) {
    if (repoRes.status === 404 || repoRes.status === 410)
      await markRepoMissing(db, owner, repo, nowSec())
    stats.status = 'failed'
    stats.reason = `repo fetch ${repoRes.status}`
    return stats
  }

  const meta = repoRes.data.meta
  const sourceOwner = meta.owner.login
  const sourceRepo = meta.name
  const headTreeSha = repoRes.data.headTreeSha
  const branch = meta.default_branch || 'main'
  const repoPushedAt = epoch(meta.pushed_at)
  const checkedAt = opts.continuation?.checkedAt ?? nowSec()

  const hasAdmittedSkills = await repoHasAdmittedSkills(db, owner, repo)

  const markUnchanged = async (status: 'skipped-tree-sha' | 'skipped-pushed-at'): Promise<SyncRepoStats> => {
    await db.batch(repoUnchangedStatements(db, { owner, repo, meta, checkedAt, ownerVerified: opts.ownerVerified === true }))
    stats.status = opts.ownerVerified ? 'verified-only' : status
    return stats
  }

  // GraphQL gave us the head tree SHA in the same request. If it matches
  // our cached value, the repo is unchanged and we skip the REST getTree
  // call entirely. Skill-less candidates deliberately bypass this cursor.
  const unchanged = opts.continuation || opts.forceContent
    ? null
    : unchangedRepoStatus({ existing: existingRepo, hasAdmittedSkills, headTreeSha, repoPushedAt })
  if (unchanged)
    return markUnchanged(unchanged)

  // The head tree SHA names the exact tree the summary saw. A branch name
  // can move between the two reads, and a SHA URL is immutable, so its ETag
  // cache entry answers 304 for as long as the tree stands.
  const treeRes = await getTree(sourceOwner, sourceRepo, headTreeSha ?? branch, bindings)
  logRateLimit(`tree ${owner}/${repo}`, treeRes.rateLimit)
  trackRateLimit(treeRes.rateLimit)

  if (!treeRes.data) {
    stats.status = treeRes.status === 403 || treeRes.status === 429 ? 'rate-limited' : 'failed'
    stats.reason = `tree_fetch_failed:${treeRes.status}`
    return stats
  }

  const tree = treeRes.data
  if (tree.truncated) {
    await markRepoTooLarge(db, owner, repo, checkedAt)
    stats.status = 'failed'
    stats.reason = 'tree_truncated'
    return stats
  }
  if (opts.continuation && opts.continuation.treeSha !== tree.sha) {
    stats.status = 'restart-required'
    stats.reason = 'tree_changed_during_continuation'
    return stats
  }
  if (!opts.continuation && !opts.forceContent && hasAdmittedSkills && existingRepo?.last_tree_sha && existingRepo.last_tree_sha === tree.sha)
    return markUnchanged('skipped-tree-sha')

  // The common unchanged-repo paths above need only the single repos row.
  // Delay the potentially many-row skills read until content actually changed.
  const existing = await loadExistingSkillSummaries(db, owner, repo)

  const skillFiles: SkillSnapshot[] = []
  for (const entry of tree.tree) {
    // Test fixtures are not Skills. The predicate is shared with every other
    // discovery path, so the count behind the canonical URL agrees with it.
    if (entry.type !== 'blob' || !isRegistrySkillPath(entry.path))
      continue
    // A repository whose SKILL.md sits at the root IS a skill, named after the
    // repository.
    //
    // This used to set a flag and drop the file, reporting
    // `root_skill_unsupported`, which quietly rejected the single most valuable
    // shape in the ecosystem: one repo, one skill, unambiguous attribution.
    // Measured on 2026-08-15, five of the six highest-evidence repositories the
    // discovery ledger had marked `empty` were exactly this, including one at
    // 4,896 evidence with 232 stars.
    //
    // Naming follows the convention `skill-mention-verify.ts` already uses for
    // the same case: the repository name is the skill name.
    //
    // `dirPath` is deliberately empty. `collectAssetsByDir` only ever looks up
    // paths that contain a slash, so a root skill collects no assets rather
    // than claiming every file in the repository as its own, which is the
    // failure this would otherwise invite on a large repo.
    if (entry.path === 'SKILL.md') {
      skillFiles.push({
        path: entry.path,
        dirName: repo,
        dirPath: '',
        treeSha: entry.sha,
      })
      continue
    }
    const dirName = dirNameFromSkillPath(entry.path)
    if (!dirName)
      continue
    skillFiles.push({
      path: entry.path,
      dirName,
      dirPath: entry.path.slice(0, -SKILL_FILE_SUFFIX.length),
      treeSha: entry.sha,
    })
  }
  stats.skillsSeen = skillFiles.length

  const now = checkedAt
  const stars = meta.stargazers_count ?? 0
  const forks = meta.forks_count ?? 0
  const repoCreatedAt = epoch(meta.created_at)
  const repoDescription = meta.description?.trim() || null
  const repoOverride = await getRepoTrustOverride(db, owner, repo)
  const reviewEligible = await hasEligibleReview(db, owner, repo)
  const kindOverride = await getRepoKindOverride(db, owner, repo)
  const repoKind: RepoKind = kindOverride ?? classifyRepoKind(skillFiles.length)
  const repoKindSource: 'computed' | 'override' = kindOverride ? 'override' : 'computed'

  // Reaching this point means GitHub returned a readable tree, so the
  // repository is not broken. Broken means the tree could not be read; a tree
  // with zero Skills is a Repository with no Skills, not a broken one.
  const repoWrite = (): D1PreparedStatement => db.prepare(
    `INSERT INTO repos (
       owner, repo, default_branch, stars, forks, description, pushed_at, repo_created_at,
       repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
       repo_skill_count, broken_since, source_owner, source_repo
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       default_branch = excluded.default_branch,
       stars = excluded.stars,
       forks = excluded.forks,
       description = excluded.description,
       pushed_at = excluded.pushed_at,
       repo_created_at = excluded.repo_created_at,
       repo_meta_synced_at = excluded.repo_meta_synced_at,
       last_tree_sha = excluded.last_tree_sha,
       repo_kind = CASE WHEN repos.repo_kind_source = 'override' THEN repos.repo_kind ELSE excluded.repo_kind END,
       repo_kind_source = CASE WHEN repos.repo_kind_source = 'override' THEN repos.repo_kind_source ELSE excluded.repo_kind_source END,
       repo_skill_count = excluded.repo_skill_count,
       broken_since = NULL,
       tree_truncated_at = NULL,
       source_owner = excluded.source_owner,
       source_repo = excluded.source_repo`,
  ).bind(
    owner,
    repo,
    branch,
    stars,
    forks,
    repoDescription,
    repoPushedAt,
    repoCreatedAt,
    now,
    tree.sha,
    repoKind,
    repoKindSource,
    skillFiles.length,
    sourceOwner,
    sourceRepo,
  )

  if (skillFiles.length === 0) {
    const statements: D1PreparedStatement[] = []
    for (const [name] of existing) {
      statements.push(db.prepare(
        `UPDATE skills
         SET source_resolved = 0,
             sync_status = 'path_missing',
             seo_indexable = 0,
             seo_index_score = MIN(seo_index_score, 0),
             seo_index_reasons = '["source_missing"]',
             seo_index_synced_at = ?,
             trust_tier = 'quarantined',
             trust_source = 'computed',
             trust_score = -50,
             trust_reasons = '["source_missing"]',
             trust_synced_at = ?
         WHERE owner = ? AND repo = ? AND name = ?`,
      ).bind(now, now, owner, repo, name))
    }
    statements.push(repoWrite())
    statements.push(...repoStarObservationStatements(db, owner, repo, stars, now))
    await db.batch(statements)
    stats.status = 'rejected'
    stats.reason = 'no_supported_skill_paths'
    return stats
  }

  const existingByPath = new Map<string, ExistingSkill>()
  for (const skill of existing.values()) {
    if (skill.rendered_skill_path)
      existingByPath.set(skill.rendered_skill_path, skill)
  }

  // Content moves one slice at a time: select changed paths, fetch, admit,
  // render, write, release. Names seen accumulate across slices because the
  // disappeared-skill judgement below needs the whole repo.
  const seenNames = new Set<string>()
  const chunkStart = Math.max(0, opts.continuation?.nextOffset ?? 0)
  const chunkSize = opts.maxSkillFiles == null
    ? skillFiles.length
    : Math.max(1, Math.floor(opts.maxSkillFiles))
  const chunkEnd = Math.min(skillFiles.length, chunkStart + chunkSize)
  const chunkFiles = skillFiles.slice(chunkStart, chunkEnd)
  const isFinalChunk = chunkEnd >= skillFiles.length

  for (const slice of slices(chunkFiles, SKILL_SLICE_SIZE)) {
    const existingNames = new Set<string>()
    for (const file of slice) {
      const byPath = existingByPath.get(file.path)
      if (byPath)
        existingNames.add(byPath.name)
      if (existing.has(file.dirName))
        existingNames.add(file.dirName)
    }
    const existingAssets = new Map(
      (await loadExistingSkillAssets(db, owner, repo, [...existingNames]))
        .map(skill => [skill.name, skill.assets]),
    )
    const assetsByDir = collectAssetsByDir(tree.tree, new Set(slice.map(f => f.dirPath)))
    const writes: WeightedWrite[] = []
    const revisionWriteIndexes: number[] = []
    const activityWriteIndexes: number[] = []

    const contentFiles: SkillSnapshot[] = []
    for (const file of slice) {
      const prev = existingByPath.get(file.path)
      const needsContent = opts.forceContent
        || !prev
        || prev.current_sha !== file.treeSha
        || prev.rendered_status !== 'ok'
      if (needsContent) {
        contentFiles.push(file)
        continue
      }

      const assets = assetsByDir.get(file.dirPath) ?? []
      const refsCount = assets.length
      const assetsJson = JSON.stringify(assets)
      const referencesChanged = prev.references_count !== refsCount || existingAssets.get(prev.name) !== assetsJson
      const ownerVerificationChanged = opts.ownerVerified === true && prev.owner_verified !== 1

      seenNames.add(prev.name)
      writes.push(weighWrite(
        db,
        `UPDATE skills
         SET references_count = ?,
             assets = ?,
             last_synced_at = ?,
             sync_status = 'ok',
             source_resolved = 1,
             owner_verified = MAX(owner_verified, ?)
         WHERE owner = ? AND repo = ? AND name = ?`,
        [
          refsCount,
          assetsJson,
          now,
          opts.ownerVerified ? 1 : 0,
          owner,
          repo,
          prev.name,
        ],
      ))
      stats.skillsUpserted += 1

      if (referencesChanged) {
        writes.push(weighWrite(
          db,
          `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
           VALUES (?, ?, ?, 'references_changed', ?, 0)
           ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
             queued_at = excluded.queued_at,
             attempts = 0`,
          [owner, repo, prev.name, now],
        ))
      }
      if (ownerVerificationChanged) {
        writes.push(weighWrite(
          db,
          `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
           VALUES (?, ?, ?, 'owner_verified', ?, 0)
           ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
             queued_at = excluded.queued_at,
             attempts = 0`,
          [owner, repo, prev.name, now],
        ))
      }
    }

    const blobs = new Map<string, string>()
    const unreadablePaths = new Set<string>()
    if (contentFiles.length > 0) {
      const blobsRes = await getBlobsBatch(sourceOwner, sourceRepo, branch, contentFiles.map(file => file.path), bindings)
      logRateLimit(`blobs ${owner}/${repo}`, blobsRes.rateLimit)
      trackRateLimit(blobsRes.rateLimit)
      if (!blobsRes.data) {
        stats.status = blobsRes.status === 403 || blobsRes.status === 429 ? 'rate-limited' : 'failed'
        stats.reason = `blob_batch_failed:${blobsRes.status}`
        return stats
      }
      for (const [path, raw] of blobsRes.data)
        blobs.set(path, raw)
      for (const path of blobsRes.unreadable)
        unreadablePaths.add(path)
      // Only a genuinely absent blob is a partial read. A blob GitHub reports
      // as binary is present and permanently unreadable, so failing the repo
      // over it burns retries forever and holds every sibling skill hostage.
      const missingBlobPath = contentFiles.find(file => !blobs.has(file.path) && !unreadablePaths.has(file.path))?.path
      if (missingBlobPath) {
        stats.status = 'failed'
        stats.reason = `blob_batch_partial:${missingBlobPath}`
        return stats
      }
    }

    type ParsedWork = SkillSnapshot & {
      raw: string
      parsed: NonNullable<ReturnType<typeof parseSkillFile>>
      prev: ExistingSkill | undefined
      assets: SkillAsset[]
      refsCount: number
      description: string | null
      isNewToRegistry: boolean
      contentChanged: boolean
      isOfficial: boolean
      ownerVerified: boolean
      trust: ReturnType<typeof resolveSkillTrust>
      indexability: ReturnType<typeof scoreSkillIndexability>
    }
    const admittedFiles: ParsedWork[] = []
    const changedPaths: string[] = []

    for (const file of contentFiles) {
      if (unreadablePaths.has(file.path)) {
        // The file is there, GitHub just will not return it as text. Keep any
        // row already built from it alive: the disappeared-skill sweep below
        // quarantines every name it does not see, and "we could not read it"
        // is not "the author deleted it".
        const previouslyIndexed = existing.get(file.dirName)
        if (previouslyIndexed)
          seenNames.add(previouslyIndexed.name)
        stats.skillsUnreadable += 1
        continue
      }

      const raw = blobs.get(file.path)!
      // A skilld cache Skill copies another package's docs. Leaving its name
      // unseen lets the sweep below retire any row indexed from it before.
      if (isSkilldCacheSkill(raw))
        continue
      const parsed = parseSkillFile(raw, file.dirName)
      if (!parsed) {
        stats.status = 'rejected'
        stats.reason = `skill_parse_rejected:${file.path}`
        return stats
      }

      const prev = existing.get(parsed.name)
      const assets = assetsByDir.get(file.dirPath) ?? []
      const refsCount = assets.length
      const description = parsed.description || repoDescription
      const isNewToRegistry = !prev || prev.current_sha == null
      const contentChanged = prev?.current_sha !== file.treeSha
      const isOfficial = isOfficialSkillRepo(owner, repo)
      const trust = resolveSkillTrust({
        owner,
        repo,
        sourceResolved: true,
        stars,
        curatorReasonCount: 0,
        approvedSocialCount: 0,
        repoSkillCount: skillFiles.length,
        overrideTier: repoOverride?.tier,
        overrideReason: repoOverride?.reason,
      })
      const ownerVerified = opts.ownerVerified === true
      const indexability = scoreSkillIndexability({
        isOfficial,
        ownerVerified,
        sourceResolved: true,
        trustTier: trust.tier,
        curatorCount: 0,
        curatorReasonCount: 0,
        // Sync has no collection joins, so without this a pinned skill would be
        // written back as noindex on every repo sync and silently undo the
        // curation call until the next full recompute.
        categoryPinned: isCategoryPinned(owner, repo, parsed.name),
        approvedSocialCount: 0,
        authorSocialCount: 0,
        stars,
        pushedAt: repoPushedAt,
        referencesCount: refsCount,
        description,
        repoSkillCount: skillFiles.length,
      }, now)

      // Indexable-only ingestion gate. The passive crawl must not repopulate the
      // long tail we retired: a brand-new skill is persisted only if it is
      // official, owner-verified, editorially reviewed as eligible, or already
      // clears the indexability bar on first sync. An eligible review admits the
      // skill without granting SEO indexability. Existing rows always continue
      // to update (and can graduate via the nightly recompute). Skipped before
      // any revisions/skills write.
      const admit = !isNewToRegistry
        || isOfficial
        || ownerVerified
        || opts.submitted === true
        || reviewEligible
        || indexability.indexable
      if (!admit)
        continue

      seenNames.add(parsed.name)
      admittedFiles.push({
        ...file,
        raw,
        parsed,
        prev,
        assets,
        refsCount,
        description,
        isNewToRegistry,
        contentChanged,
        isOfficial,
        ownerVerified,
        trust,
        indexability,
      })
      if (contentChanged)
        changedPaths.push(file.path)
    }

    const commitsByPath: NonNullable<Awaited<ReturnType<typeof getCommitsBatch>>['data']> = new Map()
    if (changedPaths.length > 0) {
      const commitsRes = await getCommitsBatch(sourceOwner, sourceRepo, changedPaths, FIRST_SYNC_COMMIT_CAP, bindings)
      logRateLimit(`commits-batch ${owner}/${repo}`, commitsRes.rateLimit)
      trackRateLimit(commitsRes.rateLimit)
      if (!commitsRes.data) {
        stats.status = commitsRes.status === 403 || commitsRes.status === 429 ? 'rate-limited' : 'failed'
        stats.reason = `commit_batch_failed:${commitsRes.status}`
        return stats
      }
      for (const [path, commits] of commitsRes.data)
        commitsByPath.set(path, commits)
      const missingCommitPath = changedPaths.find(path => !commitsByPath.has(path))
      if (missingCommitPath) {
        stats.status = 'failed'
        stats.reason = `commit_batch_partial:${missingCommitPath}`
        return stats
      }
    }

    for (const file of admittedFiles) {
      const {
        raw,
        parsed,
        prev,
        assets,
        refsCount,
        description,
        isNewToRegistry,
        contentChanged,
        isOfficial,
        ownerVerified,
        trust,
        indexability,
      } = file
      const firstSeenAt = prev?.first_seen_at ?? now
      const skillDir = file.path.replace(/\/SKILL\.md$/, '')
      const rendered = await parseSkillMd(raw, {
        owner: sourceOwner,
        repo: sourceRepo,
        name: parsed.name,
        branch,
        skillDir,
        filePath: '',
      })
      const renderedRawSha256 = await skillContentSha256(raw)

      let modifiedAt = prev?.modified_at ?? null
      if (contentChanged) {
        const commits = commitsByPath.get(file.path) ?? []
        if (commits[0])
          modifiedAt = epoch(commits[0].commit.author.date)

        for (const c of commits) {
          const occurredAt = epoch(c.commit.author.date)
          if (occurredAt == null)
            continue
          revisionWriteIndexes.push(writes.length)
          writes.push(weighWrite(
            db,
            `INSERT OR IGNORE INTO skill_revisions (owner, repo, name, sha, modified_at, author_login, message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [owner, repo, parsed.name, c.sha, occurredAt, c.author?.login ?? null, c.commit.message],
          ))
        }
      }

      writes.push(weighWrite(
        db,
        `INSERT INTO skills (
             name, owner, repo, display_name, installs, slug,
             description,
             current_sha, modified_at, first_seen_at, references_count, assets,
             last_synced_at, sync_status,
             is_official, source_resolved, seo_index_score, seo_indexable,
             seo_index_reasons, seo_index_synced_at,
             trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at,
             rendered_skill_path, rendered_status, rendered_raw, rendered_raw_sha256, rendered_frontmatter, rendered_html, rendered_at,
             owner_verified
           ) VALUES (
             ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'ok',
             ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             'ok', ?, ?, ?, ?, ?, ?
           )
           ON CONFLICT(owner, repo, name) DO UPDATE SET
             display_name = excluded.display_name,
             slug = excluded.slug,
             description = COALESCE(excluded.description, skills.description),
             current_sha = excluded.current_sha,
             modified_at = COALESCE(excluded.modified_at, skills.modified_at),
             references_count = excluded.references_count,
             assets = excluded.assets,
             last_synced_at = excluded.last_synced_at,
             sync_status = 'ok',
             is_official = excluded.is_official,
             source_resolved = excluded.source_resolved,
             seo_index_score = CASE WHEN skills.seo_index_synced_at IS NULL THEN excluded.seo_index_score ELSE skills.seo_index_score END,
             seo_indexable = CASE WHEN skills.seo_index_synced_at IS NULL THEN excluded.seo_indexable ELSE skills.seo_indexable END,
             seo_index_reasons = CASE WHEN skills.seo_index_synced_at IS NULL THEN excluded.seo_index_reasons ELSE skills.seo_index_reasons END,
             seo_index_synced_at = COALESCE(skills.seo_index_synced_at, excluded.seo_index_synced_at),
             trust_tier = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_tier ELSE skills.trust_tier END,
             trust_source = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_source ELSE skills.trust_source END,
             trust_score = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_score ELSE skills.trust_score END,
             trust_reasons = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_reasons ELSE skills.trust_reasons END,
             trust_synced_at = COALESCE(skills.trust_synced_at, excluded.trust_synced_at),
             rendered_skill_path = excluded.rendered_skill_path,
             rendered_status = excluded.rendered_status,
             rendered_raw = excluded.rendered_raw,
             rendered_raw_sha256 = excluded.rendered_raw_sha256,
             rendered_frontmatter = excluded.rendered_frontmatter,
             rendered_html = excluded.rendered_html,
             rendered_at = excluded.rendered_at,
             owner_verified = MAX(skills.owner_verified, excluded.owner_verified)`,
        [
          parsed.name,
          owner,
          repo,
          parsed.displayName,
          `${owner}/${parsed.name}`,
          description,
          file.treeSha,
          modifiedAt,
          firstSeenAt,
          refsCount,
          JSON.stringify(assets),
          now,
          isOfficial ? 1 : 0,
          indexability.score,
          indexability.indexable ? 1 : 0,
          JSON.stringify(indexability.reasons),
          now,
          trust.tier,
          trust.source,
          trust.score,
          JSON.stringify(trust.reasons),
          now,
          file.path,
          raw,
          renderedRawSha256,
          JSON.stringify(rendered.frontmatter),
          rendered.html,
          now,
          ownerVerified ? 1 : 0,
        ],
      ))
      stats.skillsUpserted += 1

      if (ownerVerified) {
        writes.push(weighWrite(
          db,
          `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
           VALUES (?, ?, ?, 'owner_verified', ?, 0)
           ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
             queued_at = excluded.queued_at,
             attempts = 0`,
          [owner, repo, parsed.name, now],
        ))
      }

      if (isNewToRegistry) {
        const occurredAt = modifiedAt ?? now
        activityWriteIndexes.push(writes.length)
        writes.push(weighWrite(
          db,
          `INSERT INTO activity (type, owner, repo, name, occurred_at, ingested_at, sha)
           SELECT 'skill_published', ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM activity
             WHERE type = 'skill_published' AND owner = ? AND repo = ? AND name = ?
               AND sha IS ?
           )`,
          [
            owner,
            repo,
            parsed.name,
            occurredAt,
            now,
            file.treeSha,
            owner,
            repo,
            parsed.name,
            file.treeSha,
          ],
        ))
      }
      else if (contentChanged) {
        const occurredAt = modifiedAt ?? now
        activityWriteIndexes.push(writes.length)
        writes.push(weighWrite(
          db,
          `INSERT INTO activity (type, owner, repo, name, occurred_at, ingested_at, sha)
           SELECT 'skill_updated', ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM activity
             WHERE type = 'skill_updated' AND owner = ? AND repo = ? AND name = ?
               AND sha IS ?
           )`,
          [
            owner,
            repo,
            parsed.name,
            occurredAt,
            now,
            file.treeSha,
            owner,
            repo,
            parsed.name,
            file.treeSha,
          ],
        ))
      }
    }

    // Each slice commits on its own so its blobs, rendered HTML, and prepared
    // statements can be released before the next slice is fetched. Every write
    // here is idempotent (upsert, INSERT OR IGNORE, or guarded by NOT EXISTS),
    // so a run that dies mid-repo is replayed safely rather than lost. That same
    // property lets the slice split again by payload size, which is what keeps a
    // content-heavy repository under the 32 MiB RPC ceiling.
    if (writes.length > 0) {
      const results = await runBoundedBatch(db, writes)
      for (const index of revisionWriteIndexes)
        stats.revisionsInserted += results[index]?.meta?.changes ?? 0
      for (const index of activityWriteIndexes)
        stats.activityEmitted += results[index]?.meta?.changes ?? 0
    }
  }

  if (!isFinalChunk) {
    stats.status = 'continuing'
    stats.continuation = {
      treeSha: tree.sha,
      checkedAt: now,
      nextOffset: chunkEnd,
    }
    return stats
  }

  // Only now is the full set of surviving names known, so the disappeared-skill
  // judgement has to wait for every chunk. Rows acknowledged by an earlier
  // invocation carry this run's stable last_synced_at checkpoint.
  const finalWrites: D1PreparedStatement[] = []
  for (const [name, skill] of existing) {
    if (!seenNames.has(name) && skill.last_synced_at !== now) {
      finalWrites.push(db.prepare(
        `UPDATE skills
           SET source_resolved = 0,
               sync_status = 'path_missing',
               seo_indexable = 0,
               seo_index_score = MIN(seo_index_score, 0),
               seo_index_reasons = '["source_missing"]',
               seo_index_synced_at = ?,
               trust_tier = 'quarantined',
               trust_source = 'computed',
               trust_score = -50,
               trust_reasons = '["source_missing"]',
               trust_synced_at = ?
         WHERE owner = ? AND repo = ? AND name = ?`,
      ).bind(now, now, owner, repo, name))
    }
  }

  // The content cursor is written last and only once every slice has committed.
  // A run that fails partway leaves the tree unacknowledged, so the next run
  // reprocesses the repo instead of skipping the slices it never read.
  finalWrites.push(repoWrite())
  finalWrites.push(...repoStarObservationStatements(db, owner, repo, stars, now))
  await db.batch(finalWrites)

  const acknowledgedBeforeThisChunk = [...existing.values()]
    .some(skill => skill.last_synced_at === now)
  if (stats.skillsUpserted === 0 && !acknowledgedBeforeThisChunk) {
    stats.status = 'rejected'
    stats.reason = 'trust_inputs_insufficient'
    return stats
  }

  stats.status = 'indexed'
  return stats
}
