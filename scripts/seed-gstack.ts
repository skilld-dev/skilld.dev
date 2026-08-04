#!/usr/bin/env tsx
/**
 * Seed garrytan/gstack into the skills registry.
 * The upstream mastra-ai/skills-api crawler hasn't picked it up yet, but
 * it's a major repo (85k stars) so we add it manually.
 *
 * Usage:
 *   npx tsx scripts/seed-gstack.ts > scripts/seed-gstack.sql
 *   npx wrangler d1 execute skilld-db --local --file=scripts/seed-gstack.sql
 */

import { parseSkillFile } from '../layers/registry/server/utils/skill-frontmatter'

interface TreeEntry {
  path: string
  type: string
  sha: string
}

const OWNER = 'garrytan'
const REPO = 'gstack'
const BRANCH = 'main'

function sqlEscape(value: string | number | null): string {
  if (value === null)
    return 'NULL'
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${value.replace(/'/g, '\'\'')}'`
}

interface SkillRow {
  name: string
  displayName: string
  description: string | null
  skillPath: string
}

async function main() {
  process.stderr.write(`Fetching tree for ${OWNER}/${REPO}@${BRANCH}...\n`)
  const tree = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`)
    .then(r => r.json() as Promise<{ tree: TreeEntry[] }>)

  // Top-level skill dirs only: `${name}/SKILL.md` (skip nested test fixtures, openclaw subskills)
  const skillFiles = tree.tree.filter(e =>
    e.type === 'blob'
    && /^[a-z0-9][a-z0-9-]*\/SKILL\.md$/i.test(e.path),
  )
  process.stderr.write(`Found ${skillFiles.length} top-level skill dirs.\n`)

  // Fetch repo metadata for stars/etc.
  const repoMeta = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)
    .then(r => r.json() as Promise<{ stargazers_count: number, forks_count: number, pushed_at: string, created_at: string, description: string | null, default_branch: string }>)
  const stars = repoMeta.stargazers_count
  const forks = repoMeta.forks_count
  const pushedAt = Math.floor(new Date(repoMeta.pushed_at).getTime() / 1000)
  const createdAt = Math.floor(new Date(repoMeta.created_at).getTime() / 1000)
  const repoDescription = repoMeta.description
  const branch = repoMeta.default_branch

  process.stderr.write(`Repo: ${stars} stars, ${forks} forks. Fetching SKILL.md frontmatter...\n`)

  const rows: SkillRow[] = []
  for (const entry of skillFiles) {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${branch}/${entry.path}`
    let content: string
    try {
      content = await fetch(url).then(r => r.text())
    }
    catch {
      process.stderr.write(`  SKIP ${entry.path}: fetch failed\n`)
      continue
    }
    const dirName = entry.path.split('/')[0]!
    const parsed = parseSkillFile(content, dirName)
    if (!parsed) {
      process.stderr.write(`  SKIP ${entry.path}: invalid skill directory\n`)
      continue
    }
    rows.push({
      name: parsed.name,
      displayName: parsed.displayName,
      description: parsed.description,
      skillPath: entry.path,
    })
    process.stderr.write(`  ${parsed.name}: ${(parsed.description ?? '').slice(0, 80)}\n`)
  }

  const now = Math.floor(Date.now() / 1000)
  const inserts: string[] = []
  for (const row of rows) {
    const slug = `${OWNER}/${row.name}`
    inserts.push(`INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  ${sqlEscape(row.name)}, ${sqlEscape(OWNER)}, ${sqlEscape(REPO)},
  ${sqlEscape(row.displayName)}, 0, ${sqlEscape(slug)},
  ${stars}, ${forks}, ${pushedAt}, ${createdAt}, ${sqlEscape(row.description ?? repoDescription)}, ${sqlEscape(branch)},
  ${now}, NULL,
  NULL, ${pushedAt}, ${now}, 0,
  ${now}, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;`)
  }

  process.stdout.write(`-- Manually seed garrytan/gstack: ${rows.length} skills\n`)
  process.stdout.write(`${inserts.join('\n')}\n`)
  process.stderr.write(`\nWrote ${inserts.length} INSERT statements.\n`)
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err}\n`)
  process.exit(1)
})
