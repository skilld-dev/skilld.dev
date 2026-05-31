/**
 * Ingest locally-generated migration guides into D1.
 *
 * Reads <dir>/*.json (skilld GeneratedGuide objects), builds an upsert SQL file,
 * and runs it through wrangler. Local generation, per the npm-guides plan.
 *
 * Usage:
 *   tsx scripts/ingest-guides.ts <dir> [--remote] [--sql-only]
 *   tsx scripts/ingest-guides.ts /tmp/guides-out --remote
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  process.stderr.write('Usage: tsx scripts/ingest-guides.ts <dir> [--remote] [--sql-only]\n')
  process.exit(1)
}
const remote = process.argv.includes('--remote')
const sqlOnly = process.argv.includes('--sql-only')
const DB = 'skilld-db'
// D1 binding/id live in wrangler.local.toml (the default config holds none);
// the database_id there is the real remote DB, so it serves both modes.
const CONFIG = 'wrangler.local.toml'

interface Guide {
  slug: string
  packageName: string
  version: string
  tag: string
  prerelease: boolean
  fromVersion?: string
  repoUrl?: string
  releasedAt?: string
  title: string
  markdown: string
  supersedes?: string[]
  model?: string
  counts?: { breaking: number, features: number, fixes: number, improvements: number }
  releaseBuckets?: unknown[]
}

const sql = (v: string | null): string => (v == null ? 'NULL' : `'${v.replace(/'/g, '\'\'')}'`)
const ZERO = { breaking: 0, features: 0, fixes: 0, improvements: 0 }

const files = readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_manifest.json')
const generatedAt = new Date().toISOString()

interface RB { version: string, buckets?: { breaking?: string[], features?: string[] }, counts?: unknown }
// The page renders only breaking + features bullets per version (fixes/improvements
// show as counts), so drop the fix/improvement bullet text — it bloats a single
// INSERT past SQLite's ~1MB statement limit on big packages (mui, wasm-pack).
function trimReleaseBuckets(rb: RB[] | undefined): unknown[] {
  return (rb ?? []).map(r => ({
    version: r.version,
    counts: r.counts,
    buckets: { breaking: r.buckets?.breaking ?? [], features: r.buckets?.features ?? [], fixes: [], improvements: [] },
  }))
}

const statements = files.map((file) => {
  const g = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Guide & { releaseBuckets?: RB[] }
  const cols = [
    sql(g.slug),
    sql(g.packageName),
    sql(g.version),
    sql(g.tag),
    g.prerelease ? '1' : '0',
    sql(g.fromVersion ?? null),
    sql(g.repoUrl ?? null),
    sql(g.releasedAt ?? null),
    sql(g.title),
    sql(g.markdown),
    sql(JSON.stringify(g.supersedes ?? [])),
    sql(JSON.stringify(trimReleaseBuckets(g.releaseBuckets))),
    sql(g.model ?? null),
    sql(generatedAt),
    String((g.counts ?? ZERO).breaking),
    String((g.counts ?? ZERO).features),
    String((g.counts ?? ZERO).fixes),
    String((g.counts ?? ZERO).improvements),
  ].join(', ')
  return `INSERT INTO npm_guides
  (slug, package_name, version, tag, prerelease, from_version, repo_url, released_at, title, markdown, supersedes, release_buckets, model, generated_at, count_breaking, count_features, count_fixes, count_improvements)
  VALUES (${cols})
  ON CONFLICT(slug) DO UPDATE SET
    package_name=excluded.package_name, version=excluded.version, tag=excluded.tag,
    prerelease=excluded.prerelease, from_version=excluded.from_version, repo_url=excluded.repo_url,
    released_at=excluded.released_at, title=excluded.title, markdown=excluded.markdown,
    supersedes=excluded.supersedes, release_buckets=excluded.release_buckets, model=excluded.model, generated_at=excluded.generated_at,
    count_breaking=excluded.count_breaking, count_features=excluded.count_features,
    count_fixes=excluded.count_fixes, count_improvements=excluded.count_improvements;`
})

const outFile = join(dir, '_ingest.sql')
writeFileSync(outFile, statements.join('\n\n'))
process.stderr.write(`Wrote ${statements.length} upserts → ${outFile}\n`)

if (sqlOnly) {
  process.stderr.write(`Run: wrangler d1 execute ${DB} --config ${CONFIG} ${remote ? '--remote' : '--local'} --file=${outFile}\n`)
  process.exit(0)
}

const args = ['d1', 'execute', DB, '--config', CONFIG, remote ? '--remote' : '--local', '--file', outFile, '-y']
process.stderr.write(`$ wrangler ${args.join(' ')}\n`)
execFileSync('wrangler', args, { stdio: 'inherit' })
process.stderr.write(`✓ ingested ${statements.length} guides (${remote ? 'remote' : 'local'})\n`)
