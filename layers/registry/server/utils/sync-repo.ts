/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings } from './github-client'
import type { SkillTrustTier } from './skill-trust'
import { getCommits, getRawFile, getRepo, getTree, logRateLimit } from './github-client'
import { parseSkillFile } from './skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from './skill-indexability'
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
  last_tree_sha: string | null
  last_synced_at: number | null
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
      `SELECT name, current_sha, modified_at, first_seen_at, last_tree_sha, last_synced_at, pushed_at
       FROM skills WHERE owner = ? AND repo = ?`,
    )
    .bind(owner, repo)
    .all<ExistingSkill>()
  const map = new Map<string, ExistingSkill>()
  for (const row of res.results ?? [])
    map.set(row.name, row)
  return map
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
  const anyExisting = existing.values().next().value as ExistingSkill | undefined

  if (
    !repoRes.notModified
    && anyExisting?.pushed_at != null
    && anyExisting.last_tree_sha != null
    && repoPushedAt != null
    && anyExisting.pushed_at >= repoPushedAt
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
  if (anyExisting?.last_tree_sha && anyExisting.last_tree_sha === tree.sha) {
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
            `INSERT OR IGNORE INTO skill_revisions (owner, name, sha, modified_at, author_login, message)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(owner, parsed.name, c.sha, occurredAt, c.author?.login ?? null, c.commit.message)
          .run()
        if (insert.meta?.changes)
          stats.revisionsInserted += insert.meta.changes
      }
    }

    await db
      .prepare(
        `INSERT INTO skills (
           name, owner, repo, display_name, installs, slug,
           stars, forks, pushed_at, repo_created_at, description, default_branch,
           repo_meta_synced_at, broken_since,
           current_sha, modified_at, first_seen_at, references_count, assets,
           last_synced_at, sync_status, last_tree_sha,
           is_official, source_resolved, seo_index_score, seo_indexable,
           seo_index_reasons, seo_index_synced_at,
           trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at,
           repo_skill_count, repo_kind, repo_kind_source
         ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'ok', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner, name) DO UPDATE SET
           repo = excluded.repo,
           display_name = excluded.display_name,
           slug = excluded.slug,
           stars = excluded.stars,
           forks = excluded.forks,
           pushed_at = excluded.pushed_at,
           repo_created_at = excluded.repo_created_at,
           description = COALESCE(excluded.description, skills.description),
           default_branch = excluded.default_branch,
           repo_meta_synced_at = excluded.repo_meta_synced_at,
           broken_since = NULL,
           current_sha = excluded.current_sha,
           modified_at = COALESCE(excluded.modified_at, skills.modified_at),
           references_count = excluded.references_count,
           assets = excluded.assets,
           last_synced_at = excluded.last_synced_at,
           sync_status = 'ok',
           last_tree_sha = excluded.last_tree_sha,
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
           repo_skill_count = excluded.repo_skill_count,
           repo_kind = CASE WHEN skills.repo_kind_source = 'override' THEN skills.repo_kind ELSE excluded.repo_kind END,
           repo_kind_source = skills.repo_kind_source`,
      )
      .bind(
        parsed.name,
        owner,
        repo,
        parsed.displayName,
        `${owner}/${parsed.name}`,
        stars,
        forks,
        repoPushedAt,
        repoCreatedAt,
        description,
        branch,
        now,
        file.treeSha,
        modifiedAt,
        firstSeenAt,
        refsCount,
        JSON.stringify(assets),
        now,
        tree.sha,
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
        skillFiles.length,
        repoKind,
        repoKindSource,
      )
      .run()
    stats.skillsUpserted += 1

    if (isNewToRegistry) {
      await db
        .prepare(
          `INSERT INTO activity (type, owner, name, occurred_at, sha)
           VALUES ('skill_published', ?, ?, ?, ?)`,
        )
        .bind(owner, parsed.name, modifiedAt ?? now, file.treeSha)
        .run()
      stats.activityEmitted += 1
    }
    else if (contentChanged) {
      await db
        .prepare(
          `INSERT INTO activity (type, owner, name, occurred_at, sha)
           VALUES ('skill_updated', ?, ?, ?, ?)`,
        )
        .bind(owner, parsed.name, modifiedAt ?? now, file.treeSha)
        .run()
      stats.activityEmitted += 1
    }
  }

  for (const [name] of existing) {
    if (!seenNames.has(name)) {
      await db
        .prepare(
          `UPDATE skills
           SET broken_since = COALESCE(broken_since, ?),
               source_resolved = 0,
               seo_indexable = 0,
               seo_index_score = MIN(seo_index_score, 0),
               seo_index_reasons = '["source_missing"]',
               seo_index_synced_at = ?,
               trust_tier = 'quarantined',
               trust_source = 'computed',
               trust_score = -50,
               trust_reasons = '["source_missing"]',
               trust_synced_at = ?
           WHERE owner = ? AND name = ?`,
        )
        .bind(now, now, now, owner, name)
        .run()
    }
  }

  return stats
}
