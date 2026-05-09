/**
 * Sync skills for a single GitHub repo into D1, bypassing skills.sh.
 *
 * Outputs SQL on stdout. Pipe to wrangler d1 execute.
 *
 * Usage:
 *   npx tsx scripts/sync-skills-gh.ts <owner>/<repo> | npx wrangler d1 execute skilld-db --local --file=-
 *   npx tsx scripts/sync-skills-gh.ts mattpocock/skills | npx wrangler d1 execute skilld-db --remote --file=-
 *
 * Behavior:
 * - Fetches the default branch tree, finds every SKILL.md.
 * - Reads the SKILL.md frontmatter for `name` and `description`; falls back to
 *   the directory name when frontmatter is missing.
 * - Upserts rows for the repo. Existing `installs` are preserved (skills.sh
 *   data) when the row already exists; new rows default to 0.
 * - Deletes rows for this owner+repo whose names no longer exist on GitHub
 *   (renames/removals), so the DB stays in sync with the live repo.
 */

import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { parseSkillFile } from '../server/utils/skill-frontmatter'

const args = process.argv.slice(2)
const target = args[0]
if (!target?.includes('/')) {
  console.error('Usage: sync-skills-gh <owner>/<repo>')
  process.exit(1)
}
const [owner, repo] = target.split('/') as [string, string]

interface RepoMeta {
  default_branch: string
  description: string | null
  stargazers_count: number
  forks_count: number
  pushed_at: string
  created_at: string
}

interface TreeEntry {
  path: string
  type: string
}

function gh<T>(path: string): T {
  const out = execFileSync('gh', ['api', path], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(out) as T
}

function fetchRaw(branch: string, path: string): string {
  const out = execFileSync(
    'curl',
    ['-fsSL', `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`],
    { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
  )
  return out
}

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlText = (s: string | null | undefined) => s == null ? 'NULL' : `'${escape(s)}'`
const epoch = (iso: string | null | undefined) => iso ? Math.floor(new Date(iso).getTime() / 1000) : 'NULL'

console.error(`[sync] ${owner}/${repo}: fetching repo meta...`)
const meta = gh<RepoMeta>(`repos/${owner}/${repo}`)
const branch = meta.default_branch || 'main'

console.error(`[sync] ${owner}/${repo}: fetching tree (${branch})...`)
const tree = gh<{ tree: TreeEntry[], truncated?: boolean }>(`repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
if (tree.truncated)
  console.error(`[sync] WARN tree was truncated; some skills may be missing.`)

const skillFiles = tree.tree.filter(e => e.type === 'blob' && e.path.endsWith('SKILL.md'))
console.error(`[sync] ${owner}/${repo}: ${skillFiles.length} SKILL.md files found.`)

interface Skill {
  name: string
  displayName: string
  description: string | null
}

const skills: Skill[] = []
for (const file of skillFiles) {
  const segments = file.path.split('/')
  if (segments.length < 2)
    continue
  const dirName = segments[segments.length - 2]!
  let raw = ''
  try {
    raw = fetchRaw(branch, file.path)
  }
  catch (err) {
    console.error(`[sync] WARN failed to fetch ${file.path}: ${(err as Error).message}`)
  }
  const parsed = parseSkillFile(raw, dirName)
  if (!parsed)
    continue
  skills.push(parsed)
}

if (!skills.length) {
  console.error(`[sync] ${owner}/${repo}: no skills, aborting (no SQL emitted).`)
  process.exit(0)
}

const stars = meta.stargazers_count ?? 0
const forks = meta.forks_count ?? 0
const pushedAt = epoch(meta.pushed_at)
const createdAt = epoch(meta.created_at)
const repoDescription = meta.description?.trim() || null
const now = Math.floor(Date.now() / 1000)

const ownerSql = sqlText(owner)
const repoSql = sqlText(repo)

// Classify the repo by skill count. Manual overrides in repo_kind_overrides
// take precedence and are preserved by the ON CONFLICT clause below.
const repoKind = skills.length > 100 ? 'aggregator' : skills.length > 5 ? 'catalog' : 'creator'

console.log(`-- sync-skills-gh: ${owner}/${repo} (${skills.length} skills, ${stars} stars, kind=${repoKind})`)
// Note: D1 manages transactions implicitly per file; explicit BEGIN/COMMIT
// is rejected.
for (const s of skills) {
  const slug = `${owner}/${s.name}`
  // Per-skill description prefers SKILL.md frontmatter, falls back to repo
  // description. Stars/forks/pushed/created/branch come from the repo.
  const desc = s.description || repoDescription
  console.log(
    `INSERT INTO skills (name, owner, repo, display_name, installs, slug, stars, forks, pushed_at, repo_created_at, description, default_branch, repo_meta_synced_at, broken_since, repo_skill_count, repo_kind)
     VALUES (${sqlText(s.name)}, ${ownerSql}, ${repoSql}, ${sqlText(s.displayName)}, 0, ${sqlText(slug)}, ${stars}, ${forks}, ${pushedAt}, ${createdAt}, ${sqlText(desc)}, ${sqlText(branch)}, ${now}, NULL, ${skills.length}, ${sqlText(repoKind)})
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
       repo_skill_count = excluded.repo_skill_count,
       repo_kind = CASE WHEN skills.repo_kind_source = 'override' THEN skills.repo_kind ELSE excluded.repo_kind END;`,
  )
}

const keepNames = skills.map(s => sqlText(s.name)).join(',')
console.log(`DELETE FROM skills WHERE owner = ${ownerSql} AND repo = ${repoSql} AND name NOT IN (${keepNames});`)

console.error(`[sync] ${owner}/${repo}: SQL emitted for ${skills.length} skills.`)
