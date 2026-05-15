/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings } from './github-client'
import type { SkillTrustTier } from './skill-trust'
import { getCommits, getRawFile, getRepo, getTree, logRateLimit } from './github-client'
import { parseSkillFile } from './skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from './skill-indexability'
import { parseSkillMd } from './skill-md-render'
import { resolveSkillTrust } from './skill-trust'

export interface SyncRepoStats {
  owner: string
  repo: string
  status: 'ok' | 'skipped-pushed-at' | 'skipped-tree-sha' | 'failed' | 'rate-limited'
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

function collectAssets(
  tree: { path: string, type: string, size?: number }[],
  skillDir: string,
): SkillAsset[] {
  const prefix = `${skillDir}/`
  const assets: SkillAsset[] = []
  for (const e of tree) {
    if (e.type !== 'blob' || !e.path.startsWith(prefix))
      continue
    const rel = e.path.slice(prefix.length)
    if (!rel || rel === 'SKILL.md')
      continue
    if (ASSET_IGNORE.test(rel))
      continue
    assets.push({ path: rel, size: e.size ?? 0, type: classifyAsset(rel) })
  }
  assets.sort((a, b) => a.path.localeCompare(b.path))
  return assets
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

interface SkillSnapshot {
  path: string
  dirName: string
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

export async function syncRepo(
  owner: string,
  repo: string,
  bindings: GithubBindings,
  db: D1Database,
): Promise<SyncRepoStats> {
  const stats: SyncRepoStats = {
    owner,
    repo,
    status: 'ok',
    skillsSeen: 0,
    skillsUpserted: 0,
    revisionsInserted: 0,
    activityEmitted: 0,
  }

  const repoRes = await getRepo(owner, repo, bindings)
  logRateLimit(`repo ${owner}/${repo}`, repoRes.rateLimit)
  if (repoRes.rateLimit)
    stats.rateLimitRemaining = repoRes.rateLimit.remaining

  if (repoRes.status === 403 || repoRes.status === 429) {
    stats.status = 'rate-limited'
    stats.reason = `rate-limited (${repoRes.rateLimit?.remaining ?? '?'} remaining)`
    return stats
  }

  if (!repoRes.data) {
    stats.status = 'failed'
    stats.reason = `repo fetch ${repoRes.status}`
    return stats
  }

  const meta = repoRes.data
  const branch = meta.default_branch || 'main'
  const repoPushedAt = epoch(meta.pushed_at)

  const existing = await loadExistingSkills(db, owner, repo)
  const existingRepo = await loadExistingRepo(db, owner, repo)

  if (
    !repoRes.notModified
    && existingRepo?.pushed_at != null
    && existingRepo.last_tree_sha != null
    && repoPushedAt != null
    && existingRepo.pushed_at >= repoPushedAt
  ) {
    stats.status = 'skipped-pushed-at'
    return stats
  }

  const treeRes = await getTree(owner, repo, branch, bindings)
  logRateLimit(`tree ${owner}/${repo}`, treeRes.rateLimit)

  if (!treeRes.data) {
    stats.status = 'failed'
    stats.reason = `tree fetch ${treeRes.status}`
    return stats
  }

  const tree = treeRes.data
  if (existingRepo?.last_tree_sha && existingRepo.last_tree_sha === tree.sha) {
    stats.status = 'skipped-tree-sha'
    return stats
  }

  const skillFiles: SkillSnapshot[] = []
  for (const entry of tree.tree) {
    if (entry.type !== 'blob' || !entry.path.endsWith(SKILL_FILE_SUFFIX))
      continue
    const dirName = dirNameFromSkillPath(entry.path)
    if (!dirName)
      continue
    skillFiles.push({ path: entry.path, dirName, treeSha: entry.sha })
  }
  stats.skillsSeen = skillFiles.length

  const now = nowSec()
  const stars = meta.stargazers_count ?? 0
  const forks = meta.forks_count ?? 0
  const repoCreatedAt = epoch(meta.created_at)
  const repoDescription = meta.description?.trim() || null
  const repoOverride = await getRepoTrustOverride(db, owner, repo)
  const kindOverride = await getRepoKindOverride(db, owner, repo)
  const repoKind: RepoKind = kindOverride ?? classifyRepoKind(skillFiles.length)
  const repoKindSource: 'computed' | 'override' = kindOverride ? 'override' : 'computed'

  // Upsert the per-repo row. Repo-level facts (stars, branch, tree sha,
  // kind, broken_since, …) live on `repos` after 0034. `repo_kind_source =
  // 'override'` rows are immutable from sync.
  await db
    .prepare(
      `INSERT INTO repos (
         owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
         repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
         repo_skill_count, broken_since
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(owner, repo) DO UPDATE SET
         default_branch = excluded.default_branch,
         stars = excluded.stars,
         forks = excluded.forks,
         pushed_at = excluded.pushed_at,
         repo_created_at = excluded.repo_created_at,
         repo_meta_synced_at = excluded.repo_meta_synced_at,
         last_tree_sha = excluded.last_tree_sha,
         repo_kind = CASE WHEN repos.repo_kind_source = 'override' THEN repos.repo_kind ELSE excluded.repo_kind END,
         repo_kind_source = repos.repo_kind_source,
         repo_skill_count = excluded.repo_skill_count,
         broken_since = NULL`,
    )
    .bind(
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
    )
    .run()

  const seenNames = new Set<string>()

  for (const file of skillFiles) {
    const raw = (await getRawFile(owner, repo, branch, file.path, bindings)) ?? ''
    const parsed = parseSkillFile(raw, file.dirName)
    if (!parsed)
      continue
    seenNames.add(parsed.name)

    const prev = existing.get(parsed.name)
    const assets = collectAssets(tree.tree, file.dirName)
    const refsCount = assets.length
    const description = parsed.description || repoDescription
    const skillDir = file.path.replace(/\/SKILL\.md$/, '')
    const rendered = parseSkillMd(raw, {
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
    const indexability = scoreSkillIndexability({
      isOfficial,
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

    let modifiedAt = prev?.modified_at ?? null
    if (contentChanged) {
      const commitsRes = await getCommits(
        owner,
        repo,
        { path: file.path, perPage: prev ? 5 : FIRST_SYNC_COMMIT_CAP },
        bindings,
      )
      logRateLimit(`commits ${owner}/${repo} ${parsed.name}`, commitsRes.rateLimit)
      const commits = commitsRes.data ?? []
      if (commits[0])
        modifiedAt = epoch(commits[0].commit.author.date)

      for (const c of commits) {
        const occurredAt = epoch(c.commit.author.date)
        if (occurredAt == null)
          continue
        const insert = await db
          .prepare(
            `INSERT OR IGNORE INTO skill_revisions (owner, repo, name, sha, modified_at, author_login, message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(owner, repo, parsed.name, c.sha, occurredAt, c.author?.login ?? null, c.commit.message)
          .run()
        if (insert.meta?.changes)
          stats.revisionsInserted += insert.meta.changes
      }
    }

    await db
      .prepare(
        `INSERT INTO skills (
           name, owner, repo, display_name, installs, slug,
           description,
           current_sha, modified_at, first_seen_at, references_count, assets,
           last_synced_at, sync_status,
           is_official, source_resolved, seo_index_score, seo_indexable,
           seo_index_reasons, seo_index_synced_at,
           trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at,
           rendered_skill_path, rendered_status, rendered_raw, rendered_frontmatter, rendered_html, rendered_at
         ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, ?, ?)
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
           rendered_at = excluded.rendered_at`,
      )
      .bind(
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
      )
      .run()
    stats.skillsUpserted += 1

    if (isNewToRegistry) {
      await db
        .prepare(
          `INSERT INTO activity (type, owner, repo, name, occurred_at, sha)
           VALUES ('skill_published', ?, ?, ?, ?, ?)`,
        )
        .bind(owner, repo, parsed.name, modifiedAt ?? now, file.treeSha)
        .run()
      stats.activityEmitted += 1
    }
    else if (contentChanged) {
      await db
        .prepare(
          `INSERT INTO activity (type, owner, repo, name, occurred_at, sha)
           VALUES ('skill_updated', ?, ?, ?, ?, ?)`,
        )
        .bind(owner, repo, parsed.name, modifiedAt ?? now, file.treeSha)
        .run()
      stats.activityEmitted += 1
    }
  }

  for (const [name] of existing) {
    if (!seenNames.has(name)) {
      await db
        .prepare(
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
        )
        .bind(now, now, owner, repo, name)
        .run()
    }
  }

  // If no skill files were seen at all in this sync, mark the whole repo
  // broken. Individual skill removals are tracked via the per-skill UPDATE
  // above.
  if (skillFiles.length === 0) {
    await db
      .prepare(`UPDATE repos SET broken_since = COALESCE(broken_since, ?) WHERE owner = ? AND repo = ?`)
      .bind(now, owner, repo)
      .run()
  }

  return stats
}
