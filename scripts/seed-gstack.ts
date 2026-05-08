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

interface TreeEntry {
  path: string
  type: string
  sha: string
}

interface Frontmatter {
  name?: string
  description?: string
}

const OWNER = 'garrytan'
const REPO = 'gstack'
const BRANCH = 'main'

function parseFrontmatter(md: string): Frontmatter {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m)
    return {}
  const fm: Frontmatter = {}
  const lines = m[1]!.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const kv = line.match(/^(\w[\w-]*):(.*)$/)
    if (!kv)
      continue
    const [, key, rawVal] = kv as [string, string, string]
    const val = rawVal.trim()

    let value = ''
    if (val === '|' || val === '>') {
      // YAML block scalar — collect indented lines following.
      const blockLines: string[] = []
      const blockStart = i + 1
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!
        if (!next.startsWith('  ') && next.trim() !== '')
          break
        blockLines.push(next.replace(/^ {2}/, ''))
        i++
      }
      void blockStart
      value = val === '>' ? blockLines.join(' ').replace(/\s+/g, ' ').trim() : blockLines.join('\n').trim()
    }
    else {
      value = val.replace(/^["']|["']$/g, '').trim()
    }

    if (key === 'name')
      fm.name = value
    else if (key === 'description')
      fm.description = value.replace(/\s+/g, ' ').trim()
  }
  return fm
}

function titleCase(slug: string): string {
  return slug
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

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
    const fm = parseFrontmatter(content)
    const dirName = entry.path.split('/')[0]!
    const skillName = (fm.name || dirName).toLowerCase().replace(/\s+/g, '-')
    const displayName = fm.name || titleCase(dirName)
    rows.push({
      name: skillName,
      displayName,
      description: fm.description ?? null,
      skillPath: entry.path,
    })
    process.stderr.write(`  ${skillName} — ${(fm.description ?? '').slice(0, 80)}\n`)
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
ON CONFLICT(owner, name) DO UPDATE SET
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
