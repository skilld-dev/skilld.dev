/// <reference types="@cloudflare/workers-types" />

import type { GithubBindings } from './github-client'
import { getCommits, getRawFile, getRepo, getTree, logRateLimit } from './github-client'
import { parseSkillFile, titleCaseFromSlug } from './skill-frontmatter'

export interface SyncRepoStats {
  owner: string
  repo: string
  status: 'ok' | 'skipped-pushed-at' | 'skipped-tree-sha' | 'failed'
  reason?: string
  skillsSeen: number
  skillsUpserted: number
  revisionsInserted: number
  activityEmitted: number
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

function refsCountForSkillDir(tree: { path: string, type: string }[], skillDir: string): number {
  const prefix = `${skillDir}/references/`
  return tree.filter(e => e.type === 'blob' && e.path.startsWith(prefix)).length
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

  const seenNames = new Set<string>()

  for (const file of skillFiles) {
    const raw = (await getRawFile(owner, repo, branch, file.path, bindings)) ?? ''
    const parsed = parseSkillFile(raw, file.dirName)
    if (!parsed)
      continue
    seenNames.add(parsed.name)

    const prev = existing.get(parsed.name)
    const refsCount = refsCountForSkillDir(tree.tree, file.dirName)
    const description = parsed.description || repoDescription
    const isNewToRegistry = !prev || prev.current_sha == null
    const contentChanged = prev?.current_sha !== file.treeSha
    const firstSeenAt = prev?.first_seen_at ?? now

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
           current_sha, modified_at, first_seen_at, references_count,
           last_synced_at, sync_status, last_tree_sha
         ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'ok', ?)
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
           last_synced_at = excluded.last_synced_at,
           sync_status = 'ok',
           last_tree_sha = excluded.last_tree_sha`,
      )
      .bind(
        parsed.name,
        owner,
        repo,
        parsed.displayName || titleCaseFromSlug(parsed.name),
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
        now,
        tree.sha,
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
        .prepare(`UPDATE skills SET broken_since = COALESCE(broken_since, ?) WHERE owner = ? AND name = ?`)
        .bind(now, owner, name)
        .run()
    }
  }

  return stats
}
