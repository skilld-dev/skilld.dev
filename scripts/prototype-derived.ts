/**
 * Prototype runner for derived-content jobs (FAQ, tags, embeddings) against the
 * local D1 database via wrangler. Pick one skill by --slug, run one kind
 * (--kind faq|tags|embedding), write to the generated table, print the result.
 *
 * Usage:
 *   pnpm tsx scripts/prototype-derived.ts --slug anthropics/skill-creator --kind faq
 *   pnpm tsx scripts/prototype-derived.ts --kind embedding --all --limit 25
 *
 * Requires:
 *   ANTHROPIC_API_KEY for faq/tags
 *   VOYAGE_API_KEY (optional) for embeddings — falls back to hash pseudo-embed
 *
 * This script shells out to `wrangler d1 execute --local` rather than binding
 * D1 directly, so we don't need a Miniflare setup here. It's slow (one shell
 * round-trip per query) but fine for prototyping on dozens of skills.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { generateEmbedding } from '../server/jobs/generate-embeddings'
import { generateFaqs } from '../server/jobs/generate-faqs'
import { generateSummary } from '../server/jobs/generate-summary'
import { generateTags } from '../server/jobs/generate-tags'

const { values } = parseArgs({
  options: {
    'slug': { type: 'string' },
    'slugs-file': { type: 'string' },
    'kind': { type: 'string' },
    'all': { type: 'boolean' },
    'limit': { type: 'string', default: '5' },
    'remote': { type: 'boolean' },
  },
})

if (!values.kind || !['faq', 'tags', 'embedding', 'summary'].includes(values.kind)) {
  console.error('Usage: --kind <faq|tags|embedding|summary> [--slug owner/name | --slugs-file path | --all --limit N] [--remote]')
  process.exit(1)
}

const KIND = values.kind as 'faq' | 'tags' | 'embedding' | 'summary'
const REMOTE_FLAG = values.remote ? '--remote' : '--local'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const VOYAGE_KEY = process.env.VOYAGE_API_KEY

if ((KIND === 'faq' || KIND === 'tags' || KIND === 'summary') && !ANTHROPIC_KEY)
  console.error('note: no ANTHROPIC_API_KEY — falling back to `claude -p` (uses local Claude Code auth)')

interface SkillPick {
  slug: string
  owner: string
  repo: string
  name: string
  displayName: string
}

function d1Query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', REMOTE_FLAG, '--json', '--command', sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 exec failed (${res.status})`)
  }
  const parsed = JSON.parse(res.stdout) as { results?: T[] }[]
  return parsed[0]?.results ?? []
}

function pickSkills(): SkillPick[] {
  if (values.slug) {
    const rows = d1Query<{ slug: string, owner: string, repo: string, name: string, display_name: string }>(
      `SELECT slug, owner, repo, name, display_name FROM skills WHERE slug = '${values.slug.replace(/'/g, '\'\'')}'`,
    )
    return rows.map(r => ({ slug: r.slug, owner: r.owner, repo: r.repo, name: r.name, displayName: r.display_name }))
  }
  if (values['slugs-file']) {
    const slugs = readFileSync(values['slugs-file'], 'utf-8')
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean)
    if (!slugs.length)
      return []
    const inClause = slugs.map((s: string) => `'${s.replace(/'/g, '\'\'')}'`).join(',')
    const rows = d1Query<{ slug: string, owner: string, repo: string, name: string, display_name: string }>(
      `SELECT slug, owner, repo, name, display_name FROM skills WHERE slug IN (${inClause})`,
    )
    return rows.map(r => ({ slug: r.slug, owner: r.owner, repo: r.repo, name: r.name, displayName: r.display_name }))
  }
  if (values.all) {
    const limit = Math.max(1, Number(values.limit) || 5)
    const rows = d1Query<{ slug: string, owner: string, repo: string, name: string, display_name: string }>(
      `SELECT slug, owner, repo, name, display_name FROM skills ORDER BY installs DESC LIMIT ${limit}`,
    )
    return rows.map(r => ({ slug: r.slug, owner: r.owner, repo: r.repo, name: r.name, displayName: r.display_name }))
  }
  throw new Error('pass --slug, --slugs-file, or --all')
}

async function fetchSkillMd(owner: string, repo: string, name: string): Promise<{ raw: string, description: string | null } | null> {
  // Ungh finds the default branch; once known, hit raw.githubusercontent.
  const meta = await fetch(`https://ungh.cc/repos/${owner}/${repo}`).then(r => r.json() as Promise<{ repo?: { defaultBranch: string, description: string | null } }>).catch(() => null)
  if (!meta?.repo)
    return null
  const branch = meta.repo.defaultBranch
  const tree = await fetch(`https://ungh.cc/repos/${owner}/${repo}/files/${branch}`).then(r => r.json() as Promise<{ files?: { path: string }[] }>).catch(() => null)
  const skillFiles = tree?.files?.filter(f => f.path.endsWith('SKILL.md')) ?? []
  const hit
    = skillFiles.find(f => f.path.endsWith(`/${name}/SKILL.md`) || f.path === `${name}/SKILL.md`)
      ?? (skillFiles.length === 1 ? skillFiles[0] : skillFiles.find(f => f.path.split('/').includes(name)))
  if (!hit)
    return null
  const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${hit.path}`).then(r => r.text()).catch(() => null)
  if (!raw)
    return null
  return { raw, description: meta.repo.description }
}

// Fake D1 wrapper — writes go through putGenerated -> bound db.prepare.
// We shim enough of the D1Database surface to let our wrapper run by shelling
// out to wrangler. Read-only for now; writes are serialized as SQL statements.
function makeShimDb(): D1Database {
  const shim = {
    prepare(sql: string) {
      let bound: unknown[] = []
      return {
        bind(...args: unknown[]) {
          bound = args
          return this
        },
        async first<T>() {
          const filled = fillSql(sql, bound)
          const rows = d1Query<T>(filled)
          return rows[0] ?? null
        },
        async all<T>() {
          const filled = fillSql(sql, bound)
          return { results: d1Query<T>(filled) }
        },
        async run() {
          const filled = fillSql(sql, bound)
          d1Query(filled)
        },
      }
    },
  }
  return shim as unknown as D1Database
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined)
    return 'NULL'
  if (typeof v === 'number')
    return String(v)
  if (typeof v === 'boolean')
    return v ? '1' : '0'
  return `'${String(v).replace(/'/g, '\'\'')}'`
}

function fillSql(sql: string, params: unknown[]): string {
  let i = 0
  return sql.replace(/\?/g, () => sqlLiteral(params[i++]))
}

async function run() {
  const skills = pickSkills()
  if (!skills.length) {
    console.error('no skills matched')
    process.exit(1)
  }

  const db = makeShimDb()

  for (const skill of skills) {
    console.log(`\n▸ ${skill.owner}/${skill.name} (${KIND})`)
    const src = await fetchSkillMd(skill.owner, skill.repo, skill.name)
    if (!src) {
      console.log('  ✗ no SKILL.md')
      continue
    }

    try {
      if (KIND === 'faq') {
        const out = await generateFaqs({ db, apiKey: ANTHROPIC_KEY }, { owner: skill.owner, repo: skill.repo, name: skill.name, raw: src.raw })
        console.log(out ? `  ✓ ${out.items.length} FAQs` : '  ✗ no payload')
        if (out) {
          for (const q of out.items) console.log(`    Q: ${q.question}\n    A: ${q.answer}\n`)
        }
      }
      else if (KIND === 'tags') {
        const out = await generateTags({ db, apiKey: ANTHROPIC_KEY }, { owner: skill.owner, repo: skill.repo, name: skill.name, displayName: skill.displayName, raw: src.raw })
        console.log(out ? `  ✓ tags: ${out.tags.join(', ')}` : '  ✗ no payload')
      }
      else if (KIND === 'embedding') {
        const out = await generateEmbedding({ db, voyageKey: VOYAGE_KEY }, { owner: skill.owner, repo: skill.repo, name: skill.name, displayName: skill.displayName, description: src.description, raw: src.raw })
        console.log(out ? `  ✓ embed dim=${out.dim} model=${out.model}` : '  ✗ no payload')
      }
      else if (KIND === 'summary') {
        const out = await generateSummary({ db, apiKey: ANTHROPIC_KEY }, { owner: skill.owner, repo: skill.repo, name: skill.name, displayName: skill.displayName, raw: src.raw })
        if (!out) {
          console.log('  ✗ no payload')
        }
        else {
          console.log(`  ✓ summary`)
          console.log(`    tagline: ${out.tagline}`)
          console.log(`    blurb: ${out.blurb}`)
          for (const uc of out.useCases) console.log(`    • ${uc}`)
        }
      }
    }
    catch (err) {
      console.error(`  ✗ ${err instanceof Error ? err.message : err}`)
    }
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
