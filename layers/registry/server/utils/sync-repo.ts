/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings, RepoMeta } from './github-client'
import type { SkillTrustTier } from './skill-trust'
import { getBlobsBatch, getCommitsBatch, getRepoSummary, getTree, logRateLimit } from './github-client'
import { parseSkillFile } from './skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from './skill-indexability'
import { parseSkillMd } from './skill-md-render'
import { resolveSkillTrust } from './skill-trust'

export interface SyncRepoStats {
  owner: string
  repo: string
  status: 'indexed' | 'verified-only' | 'rejected' | 'skipped-pushed-at' | 'skipped-tree-sha' | 'failed' | 'rate-limited' | 'unauthorized'
  reason?: string
  skillsSeen: number
  skillsUpserted: number
  revisionsInserted: number
  activityEmitted: number
  rateLimitRemaining?: number
}

interface ExistingSkill {
  name: string
  current_sha: string | null
  modified_at: number | null
  first_seen_at: number | null
  last_synced_at: number | null
}

interface ExistingRepo {
  last_tree_sha: string | null
  pushed_at: number | null
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

async function loadExistingSkills(db: D1Database, owner: string, repo: string): Promise<Map<string, ExistingSkill>> {
  const res = await db
    .prepare(
      `SELECT name, current_sha, modified_at, first_seen_at, last_synced_at
       FROM skills WHERE owner = ? AND repo = ?`,
    )
    .bind(owner, repo)
    .all<ExistingSkill>()
  const map = new Map<string, ExistingSkill>()
  for (const row of res.results ?? [])
    map.set(row.name, row)
  return map
}

async function loadExistingRepo(db: D1Database, owner: string, repo: string): Promise<ExistingRepo | null> {
  return await db
    .prepare(`SELECT last_tree_sha, pushed_at FROM repos WHERE owner = ? AND repo = ?`)
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
           pushed_at = ?,
           repo_created_at = ?,
           repo_meta_synced_at = ?,
           broken_since = NULL
       WHERE owner = ? AND repo = ?`,
    )
    .bind(
      meta.default_branch || 'main',
      meta.stargazers_count ?? 0,
      meta.forks_count ?? 0,
      pushedAt,
      epoch(meta.created_at),
      checkedAt,
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

async function markUnchangedOwnerVerified(
  db: D1Database,
  owner: string,
  repo: string,
  meta: RepoMeta,
  pushedAt: number | null,
  checkedAt: number,
): Promise<void> {
  await db.batch([
    markRepoSummaryCheckedStatement(db, owner, repo, meta, pushedAt, checkedAt),
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
  ])
}

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
         WHERE owner = ? AND repo = ?`,
      )
      .bind(now, now, now, owner, repo)
      .run(),
  ])
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
    revisionsInserted: 0,
    activityEmitted: 0,
  }

  const repoRes = await getRepoSummary(owner, repo, bindings)
  logRateLimit(`repo ${owner}/${repo}`, repoRes.rateLimit)
  if (repoRes.rateLimit)
    stats.rateLimitRemaining = repoRes.rateLimit.remaining

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
  const headTreeSha = repoRes.data.headTreeSha
  const branch = meta.default_branch || 'main'
  const repoPushedAt = epoch(meta.pushed_at)
  const checkedAt = nowSec()

  const existingRepo = await loadExistingRepo(db, owner, repo)
  const hasAdmittedSkills = await repoHasAdmittedSkills(db, owner, repo)

  const markUnchanged = async (status: 'skipped-tree-sha' | 'skipped-pushed-at'): Promise<SyncRepoStats> => {
    if (opts.ownerVerified) {
      await markUnchangedOwnerVerified(db, owner, repo, meta, repoPushedAt, checkedAt)
      stats.status = 'verified-only'
      return stats
    }
    await markRepoSummaryCheckedStatement(db, owner, repo, meta, repoPushedAt, checkedAt).run()
    stats.status = status
    return stats
  }

  // GraphQL gave us the head tree SHA in the same request. If it matches
  // our cached value, the repo is unchanged and we skip the REST getTree
  // call entirely. Skill-less candidates deliberately bypass this cursor.
  if (hasAdmittedSkills && existingRepo?.last_tree_sha && headTreeSha && existingRepo.last_tree_sha === headTreeSha)
    return markUnchanged('skipped-tree-sha')

  if (
    hasAdmittedSkills
    && existingRepo?.pushed_at != null
    && existingRepo.last_tree_sha != null
    && repoPushedAt != null
    && existingRepo.pushed_at >= repoPushedAt
  ) {
    return markUnchanged('skipped-pushed-at')
  }

  const treeRes = await getTree(owner, repo, branch, bindings)
  logRateLimit(`tree ${owner}/${repo}`, treeRes.rateLimit)

  if (!treeRes.data) {
    stats.status = treeRes.status === 403 || treeRes.status === 429 ? 'rate-limited' : 'failed'
    stats.reason = `tree_fetch_failed:${treeRes.status}`
    return stats
  }

  const tree = treeRes.data
  if (tree.truncated) {
    stats.status = 'failed'
    stats.reason = 'tree_truncated'
    return stats
  }
  if (hasAdmittedSkills && existingRepo?.last_tree_sha && existingRepo.last_tree_sha === tree.sha)
    return markUnchanged('skipped-tree-sha')

  // The common unchanged-repo paths above need only the single repos row.
  // Delay the potentially many-row skills read until content actually changed.
  const existing = await loadExistingSkills(db, owner, repo)

  const skillFiles: SkillSnapshot[] = []
  let hasRootSkill = false
  for (const entry of tree.tree) {
    if (entry.type !== 'blob')
      continue
    if (entry.path === 'SKILL.md') {
      hasRootSkill = true
      continue
    }
    if (!entry.path.endsWith(SKILL_FILE_SUFFIX))
      continue
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
  const kindOverride = await getRepoKindOverride(db, owner, repo)
  const repoKind: RepoKind = kindOverride ?? classifyRepoKind(skillFiles.length)
  const repoKindSource: 'computed' | 'override' = kindOverride ? 'override' : 'computed'

  const repoWrite = (brokenSince: number | null): D1PreparedStatement => db.prepare(
    `INSERT INTO repos (
       owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
       repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
       repo_skill_count, broken_since
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       default_branch = excluded.default_branch,
       stars = excluded.stars,
       forks = excluded.forks,
       pushed_at = excluded.pushed_at,
       repo_created_at = excluded.repo_created_at,
       repo_meta_synced_at = excluded.repo_meta_synced_at,
       last_tree_sha = excluded.last_tree_sha,
       repo_kind = CASE WHEN repos.repo_kind_source = 'override' THEN repos.repo_kind ELSE excluded.repo_kind END,
       repo_kind_source = CASE WHEN repos.repo_kind_source = 'override' THEN repos.repo_kind_source ELSE excluded.repo_kind_source END,
       repo_skill_count = excluded.repo_skill_count,
       broken_since = excluded.broken_since`,
  ).bind(
    owner,
    repo,
    branch,
    stars,
    forks,
    repoPushedAt,
    repoCreatedAt,
    now,
    tree.sha,
    repoKind,
    repoKindSource,
    skillFiles.length,
    brokenSince,
  )

  if (skillFiles.length === 0) {
    const statements: D1PreparedStatement[] = []
    for (const [name] of existing) {
      statements.push(db.prepare(
        `UPDATE skills
         SET source_resolved = 0,
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
    statements.push(repoWrite(now))
    await db.batch(statements)
    stats.status = 'rejected'
    stats.reason = hasRootSkill ? 'root_skill_unsupported' : 'no_supported_skill_paths'
    return stats
  }

  // Content moves one slice at a time: fetch, render, write, release. Holding
  // the whole repo is what killed the isolate on 2026-07-26; see
  // SKILL_SLICE_SIZE. Names seen accumulate across slices because the
  // disappeared-skill judgement below needs the whole repo, but names are
  // cheap where blobs and rendered HTML are not.
  const seenNames = new Set<string>()

  for (const slice of slices(skillFiles, SKILL_SLICE_SIZE)) {
    // One blob request per slice, replacing N raw.githubusercontent.com
    // fetches (per-IP-throttled, ignores auth). Commits for the changed paths
    // in the same slice follow in a second request.
    const blobsRes = await getBlobsBatch(owner, repo, branch, slice.map(f => f.path), bindings)
    logRateLimit(`blobs ${owner}/${repo}`, blobsRes.rateLimit)
    if (!blobsRes.data) {
      stats.status = blobsRes.status === 403 || blobsRes.status === 429 ? 'rate-limited' : 'failed'
      stats.reason = `blob_batch_failed:${blobsRes.status}`
      return stats
    }
    const blobs = blobsRes.data
    const missingBlobPath = slice.find(file => !blobs.has(file.path))?.path
    if (missingBlobPath) {
      stats.status = 'failed'
      stats.reason = `blob_batch_partial:${missingBlobPath}`
      return stats
    }

    const changedPaths: string[] = []
    const parsedFiles: Array<SkillSnapshot & { raw: string, parsed: NonNullable<ReturnType<typeof parseSkillFile>> }> = []
    for (const file of slice) {
      const raw = blobs.get(file.path)!
      const parsed = parseSkillFile(raw, file.dirName)
      if (!parsed) {
        stats.status = 'rejected'
        stats.reason = `skill_parse_rejected:${file.path}`
        return stats
      }
      parsedFiles.push({ ...file, raw, parsed })
      const prev = existing.get(parsed.name)
      if (prev?.current_sha !== file.treeSha)
        changedPaths.push(file.path)
    }
    // Use the higher per-file cap unconditionally: the GraphQL fan-out is one
    // request regardless of perPage, so paying the extra commit nodes for new
    // skills (cap 30) saves the per-skill perPage branch.
    const commitsRes = await getCommitsBatch(owner, repo, changedPaths, FIRST_SYNC_COMMIT_CAP, bindings)
    logRateLimit(`commits-batch ${owner}/${repo}`, commitsRes.rateLimit)
    if (!commitsRes.data) {
      stats.status = commitsRes.status === 403 || commitsRes.status === 429 ? 'rate-limited' : 'failed'
      stats.reason = `commit_batch_failed:${commitsRes.status}`
      return stats
    }
    const commitsByPath = commitsRes.data
    const missingCommitPath = changedPaths.find(path => !commitsByPath.has(path))
    if (missingCommitPath) {
      stats.status = 'failed'
      stats.reason = `commit_batch_partial:${missingCommitPath}`
      return stats
    }

    const assetsByDir = collectAssetsByDir(tree.tree, new Set(slice.map(f => f.dirPath)))

    const writes: D1PreparedStatement[] = []
    const revisionWriteIndexes: number[] = []
    const activityWriteIndexes: number[] = []

    for (const file of parsedFiles) {
      const { raw, parsed } = file
      seenNames.add(parsed.name)

      const prev = existing.get(parsed.name)
      const assets = assetsByDir.get(file.dirPath) ?? []
      const refsCount = assets.length
      const description = parsed.description || repoDescription
      const skillDir = file.path.replace(/\/SKILL\.md$/, '')
      const rendered = await parseSkillMd(raw, {
        owner,
        repo,
        name: parsed.name,
        branch,
        skillDir,
        filePath: '',
      })
      const isNewToRegistry = !prev || prev.current_sha == null
      const contentChanged = prev?.current_sha !== file.treeSha
      const firstSeenAt = prev?.first_seen_at ?? now
      const isOfficial = isOfficialSkillRepo(owner, repo)
      const trust = resolveSkillTrust({
        owner,
        repo,
        sourceResolved: true,
        installs: 0,
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
        approvedSocialCount: 0,
        authorSocialCount: 0,
        installs: 0,
        stars,
        pushedAt: repoPushedAt,
        referencesCount: refsCount,
        description,
        repoSkillCount: skillFiles.length,
      }, now)

      // Indexable-only ingestion gate. The passive crawl must not repopulate the
      // long tail we retired: a brand-new skill is persisted only if it is
      // official, owner-verified, or already clears the indexability bar on first
      // sync. Existing rows always continue to update (and can graduate via the
      // nightly recompute). Skipped before any revisions/skills write.
      const admit = !isNewToRegistry || isOfficial || ownerVerified || indexability.indexable
      if (!admit)
        continue

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
          writes.push(db.prepare(
            `INSERT OR IGNORE INTO skill_revisions (owner, repo, name, sha, modified_at, author_login, message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).bind(owner, repo, parsed.name, c.sha, occurredAt, c.author?.login ?? null, c.commit.message))
        }
      }

      writes.push(db.prepare(
        `INSERT INTO skills (
             name, owner, repo, display_name, installs, slug,
             description,
             current_sha, modified_at, first_seen_at, references_count, assets,
             last_synced_at, sync_status,
             is_official, source_resolved, seo_index_score, seo_indexable,
             seo_index_reasons, seo_index_synced_at,
             trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at,
             rendered_skill_path, rendered_status, rendered_raw, rendered_frontmatter, rendered_html, rendered_at,
             owner_verified
           ) VALUES (
             ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'ok',
             ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             'ok', ?, ?, ?, ?, ?
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
             rendered_frontmatter = excluded.rendered_frontmatter,
             rendered_html = excluded.rendered_html,
             rendered_at = excluded.rendered_at,
             owner_verified = MAX(skills.owner_verified, excluded.owner_verified)`,
      ).bind(
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
        JSON.stringify(rendered.frontmatter),
        rendered.html,
        now,
        ownerVerified ? 1 : 0,
      ))
      stats.skillsUpserted += 1

      if (ownerVerified) {
        writes.push(db.prepare(
          `INSERT INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
           VALUES (?, ?, ?, 'owner_verified', ?, 0)
           ON CONFLICT(owner, repo, name, reason) DO UPDATE SET
             queued_at = excluded.queued_at,
             attempts = 0`,
        ).bind(owner, repo, parsed.name, now))
      }

      if (isNewToRegistry) {
        const occurredAt = modifiedAt ?? now
        activityWriteIndexes.push(writes.length)
        writes.push(db.prepare(
          `INSERT INTO activity (type, owner, repo, name, occurred_at, ingested_at, sha)
           SELECT 'skill_published', ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM activity
             WHERE type = 'skill_published' AND owner = ? AND repo = ? AND name = ?
               AND sha IS ?
           )`,
        ).bind(
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
        ))
      }
      else if (contentChanged) {
        const occurredAt = modifiedAt ?? now
        activityWriteIndexes.push(writes.length)
        writes.push(db.prepare(
          `INSERT INTO activity (type, owner, repo, name, occurred_at, ingested_at, sha)
           SELECT 'skill_updated', ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM activity
             WHERE type = 'skill_updated' AND owner = ? AND repo = ? AND name = ?
               AND sha IS ?
           )`,
        ).bind(
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
        ))
      }
    }

    // Each slice commits on its own so its blobs, rendered HTML, and prepared
    // statements can be released before the next slice is fetched. Every write
    // here is idempotent (upsert, INSERT OR IGNORE, or guarded by NOT EXISTS),
    // so a run that dies mid-repo is replayed safely rather than lost.
    if (writes.length > 0) {
      const results = await db.batch(writes)
      for (const index of revisionWriteIndexes)
        stats.revisionsInserted += results[index]?.meta?.changes ?? 0
      for (const index of activityWriteIndexes)
        stats.activityEmitted += results[index]?.meta?.changes ?? 0
    }
  }

  // Only now is the full set of surviving names known, so the disappeared-skill
  // judgement has to wait for every slice.
  const finalWrites: D1PreparedStatement[] = []
  for (const [name] of existing) {
    if (!seenNames.has(name)) {
      finalWrites.push(db.prepare(
        `UPDATE skills
           SET source_resolved = 0,
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
  finalWrites.push(repoWrite(null))
  await db.batch(finalWrites)

  if (stats.skillsUpserted === 0) {
    stats.status = 'rejected'
    stats.reason = 'trust_inputs_insufficient'
    return stats
  }

  stats.status = 'indexed'
  return stats
}
