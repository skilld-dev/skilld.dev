/**
 * Deep-sync via shallow `git clone` + local fs/git scan instead of GitHub API
 * crawl. Massively faster than scripts/deep-sync-top.ts for large catalogs:
 *
 *   - 1 GraphQL call per 50 repos for stars/forks/description/default_branch
 *   - 1 shallow clone per repo (depth 30)
 *   - Local `git log` per skill for revisions (no API call)
 *   - Concurrent across repos (default 6) — limited by network/disk, not GH rate limit
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) npx tsx scripts/deep-sync-clone.ts --limit 100 > /tmp/deep-clone.sql
 *
 * Flags:
 *   --limit N         (default 100) top-N by stars, skipping recently synced
 *   --repos a/b,c/d   explicit list, bypasses --limit
 *   --concurrency N   (default 6) parallel clones
 */

import type { SkillTrustTier } from '~~/layers/registry/server/utils/skill-trust'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
async function runP(cmd: string, args: string[], opts: { timeout?: number, maxBuffer?: number, cwd?: string } = {}): Promise<{ stdout: string, stderr: string, code: number }> {
  try {
    const r = await execFileP(cmd, args, { encoding: 'utf-8', timeout: opts.timeout ?? 60_000, maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024, cwd: opts.cwd })
    return { stdout: r.stdout, stderr: r.stderr, code: 0 }
  }
  catch (e) {
    const err = e as { stdout?: string, stderr?: string, code?: number }
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? String(e), code: err.code ?? 1 }
  }
}
import { parseSkillFile } from '~~/layers/registry/server/utils/skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from '~~/layers/registry/server/utils/skill-indexability'
import { resolveSkillTrust } from '~~/layers/registry/server/utils/skill-trust'

interface TopRepo { owner: string, repo: string, stars: number }
interface KindOverride { kind: 'creator' | 'catalog' | 'aggregator' }
interface TrustOverride { tier: SkillTrustTier, reason: string | null }

const args = process.argv.slice(2)
const LIMIT = +(args[args.indexOf('--limit') + 1] ?? 100)
const CONCURRENCY = +(args[args.indexOf('--concurrency') + 1] ?? 6)
const reposIdx = args.indexOf('--repos')
const EXPLICIT = reposIdx >= 0 ? (args[reposIdx + 1] ?? '').split(',').filter(Boolean) : []
const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) { console.error('GITHUB_TOKEN required'); process.exit(1) }
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'
const MAX_CLONE_BYTES = 600 * 1024 * 1024 // 600MB safety cap

const SQUOTE_RE = /'/g
const sql = (s: string | null | undefined) => s == null ? 'NULL' : `'${s.replace(SQUOTE_RE, '\'\'')}'`
const epochOf = (iso: string | null | undefined) => iso ? Math.floor(new Date(iso).getTime() / 1000) : null
const nullable = (n: number | null | undefined) => n == null ? 'NULL' : String(n)

function d1Query<T>(q: string): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', q], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  })
  return ((JSON.parse(out) as Array<{ results: T[] }>)[0]?.results) ?? []
}

interface RepoMetaNode {
  stargazerCount: number
  forkCount: number
  pushedAt: string | null
  createdAt: string | null
  description: string | null
  defaultBranchRef: { name: string } | null
}
function ghGraphql(query: string): { data: Record<string, RepoMetaNode | null>, errors?: { type?: string, path?: string[] }[] } {
  const res = spawnSync('gh', ['api', 'graphql', '-f', `query=${query}`], {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (!res.stdout?.trim())
    throw new Error(`gh graphql failed: ${res.stderr?.slice(0, 500)}`)
  return JSON.parse(res.stdout)
}

function fetchRepoMeta(repos: TopRepo[]): Map<string, RepoMetaNode | null> {
  const out = new Map<string, RepoMetaNode | null>()
  const BATCH = 50
  for (let i = 0; i < repos.length; i += BATCH) {
    const slice = repos.slice(i, i + BATCH)
    const q = `query {\n${slice.map((r, j) =>
      `  r${j}: repository(owner: "${r.owner}", name: "${r.repo}") { stargazerCount forkCount pushedAt createdAt description defaultBranchRef { name } }`,
    ).join('\n')}\n}`
    let res
    try { res = ghGraphql(q) }
    catch (e) { console.error(`  graphql batch ${i} failed`); continue }
    const notFound = new Set<number>()
    for (const e of res.errors ?? []) {
      if (e.type === 'NOT_FOUND' && e.path?.[0]?.startsWith('r'))
        notFound.add(+e.path[0].slice(1))
    }
    slice.forEach((r, j) => {
      const node = res.data[`r${j}`]
      out.set(`${r.owner}/${r.repo}`, (node && !notFound.has(j)) ? node : null)
    })
  }
  return out
}

async function shallowClone(owner: string, repo: string, dir: string): Promise<{ ok: boolean, reason?: string }> {
  const url = `https://x-access-token:${TOKEN}@github.com/${owner}/${repo}.git`
  // Partial clone: full commit/tree history, no blobs (lazy-fetched on demand).
  // Lets us run `git log -- path` over real history while keeping the clone tiny.
  const r = await runP('git', ['clone', '--filter=blob:none', '--no-checkout', '--quiet', '--no-tags', url, dir], { timeout: 240_000 })
  if (r.code !== 0)
    return { ok: false, reason: r.stderr.split('\n')[0]?.slice(0, 200) || `exit ${r.code}` }
  return { ok: true }
}

async function gitReadFile(dir: string, path: string): Promise<string | null> {
  const r = await runP('git', ['-C', dir, 'cat-file', '-p', `HEAD:${path}`], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })
  return r.code === 0 ? r.stdout : null
}

async function gitListSkillFiles(dir: string): Promise<string[]> {
  const r = await runP('git', ['-C', dir, 'ls-tree', '-r', '--name-only', 'HEAD'], { maxBuffer: 64 * 1024 * 1024 })
  if (r.code !== 0)
    return []
  return r.stdout.split('\n').filter(p => p.endsWith('SKILL.md'))
}

async function gitTreeSha(dir: string, path: string): Promise<string> {
  const r = await runP('git', ['-C', dir, 'rev-parse', `HEAD:${path}`], {})
  return r.stdout.trim()
}

async function gitHeadTreeSha(dir: string): Promise<string> {
  const r = await runP('git', ['-C', dir, 'rev-parse', 'HEAD^{tree}'], {})
  return r.stdout.trim()
}

interface Commit { sha: string, date: string, login: string, message: string }
async function gitLog(dir: string, path: string, limit: number): Promise<Commit[]> {
  const SEP = '\x1E'
  const FS = '\x1F'
  const r = await runP('git', ['-C', dir, 'log', `-n${limit}`, `--format=${FS}%H${SEP}%aI${SEP}%aN${SEP}%s`, '--', path], { maxBuffer: 16 * 1024 * 1024 })
  if (r.code !== 0)
    return []
  const out: Commit[] = []
  for (const rec of r.stdout.split(FS).slice(1)) {
    const [sha, date, login, ...msg] = rec.split(SEP)
    if (!sha)
      continue
    out.push({ sha: sha!, date: date ?? '', login: login ?? '', message: msg.join(SEP).trim() })
  }
  return out
}

interface DirEntry { path: string, size: number }
async function listDirEntries(dir: string, skillDir: string): Promise<DirEntry[]> {
  const r = await runP('git', ['-C', dir, 'ls-tree', '-r', '--long', 'HEAD', skillDir], { maxBuffer: 64 * 1024 * 1024 })
  if (r.code !== 0)
    return []
  const out: DirEntry[] = []
  for (const line of r.stdout.split('\n')) {
    if (!line)
      continue
    const m = line.match(/^\d+ (\w+) [a-f0-9]+\s+(\d+)\t(.+)$/)
    if (!m || m[1] !== 'blob')
      continue
    out.push({ path: m[3]!, size: +(m[2] ?? 0) })
  }
  return out
}

function classifyAsset(path: string): 'markdown' | 'code' | 'image' | 'data' | 'other' {
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
function collectAssets(entries: DirEntry[], skillDir: string) {
  const prefix = skillDir === '' ? '' : `${skillDir}/`
  const out: { path: string, size: number, type: string }[] = []
  for (const e of entries) {
    if (!e.path.startsWith(prefix))
      continue
    const rel = e.path.slice(prefix.length)
    if (!rel || rel === 'SKILL.md' || ASSET_IGNORE.test(rel))
      continue
    out.push({ path: rel, size: e.size, type: classifyAsset(rel) })
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out.slice(0, 100)
}

function classifyKind(n: number): 'creator' | 'catalog' | 'aggregator' {
  if (n > 100)
    return 'aggregator'
  if (n > 5)
    return 'catalog'
  return 'creator'
}

function dirSize(dir: string): number {
  try {
    const out = execFileSync('du', ['-sb', dir], { encoding: 'utf-8' })
    return +(out.split(/\s/)[0] ?? 0)
  }
  catch { return 0 }
}

let okCount = 0; let failCount = 0; let skillCount = 0; let revCount = 0

async function syncRepo(target: TopRepo, meta: RepoMetaNode | null, kindOv: Map<string, KindOverride['kind']>, trustOv: Map<string, TrustOverride>) {
  const { owner, repo } = target
  const slug = `${owner}/${repo}`
  if (!meta) {
    const now = Math.floor(Date.now() / 1000)
    console.log(`UPDATE skills SET broken_since = ${now} WHERE owner = ${sql(owner)} AND repo = ${sql(repo)} AND broken_since IS NULL;`)
    console.error(`  ! ${slug}: 404`)
    failCount++
    return
  }

  const dir = mkdtempSync(join(tmpdir(), `dsc-${owner}-${repo}-`))
  try {
    const cl = await shallowClone(owner, repo, dir)
    if (!cl.ok) {
      console.error(`  ! ${slug}: clone failed: ${cl.reason}`)
      failCount++
      return
    }
    const size = dirSize(dir)
    if (size > MAX_CLONE_BYTES) {
      console.error(`  ! ${slug}: clone too big (${(size / 1024 / 1024).toFixed(0)}MB), skipping`)
      failCount++
      return
    }

    const skillPaths = await gitListSkillFiles(dir)
    if (!skillPaths.length) {
      console.error(`  - ${slug}: no SKILL.md`)
      okCount++
      return
    }

    const treeShaRoot = await gitHeadTreeSha(dir)
    const now = Math.floor(Date.now() / 1000)
    const branch = meta.defaultBranchRef?.name ?? 'main'
    const stars = meta.stargazerCount
    const forks = meta.forkCount
    const repoPushedAt = epochOf(meta.pushedAt)
    const repoCreatedAt = epochOf(meta.createdAt)
    const repoDescription = meta.description?.trim() || null
    const trustOverride = trustOv.get(slug)
    const kindOverride = kindOv.get(slug)
    const repoKind = kindOverride ?? classifyKind(skillPaths.length)
    const repoKindSource = kindOverride ? 'override' : 'computed'

    console.log(`-- ${slug} (${skillPaths.length} skills, ${stars} stars, kind=${repoKind})`)
    const seenNames: string[] = []

    for (const skillPath of skillPaths) {
      const skillDir = skillPath.includes('/') ? skillPath.slice(0, skillPath.lastIndexOf('/')) : ''
      const dirName = skillDir.split('/').pop() ?? repo
      const raw = await gitReadFile(dir, skillPath)
      if (raw == null)
        continue
      const parsed = parseSkillFile(raw, dirName)
      if (!parsed)
        continue
      seenNames.push(parsed.name)

      const dirEntries = await listDirEntries(dir, skillDir)
      const assets = collectAssets(dirEntries, skillDir)
      const refsCount = assets.length
      const description = parsed.description || repoDescription
      const isOfficial = isOfficialSkillRepo(owner, repo)
      const trust = resolveSkillTrust({
        owner,
        repo,
        sourceResolved: true,
        installs: 0,
        curatorReasonCount: 0,
        approvedSocialCount: 0,
        repoSkillCount: skillPaths.length,
        overrideTier: trustOverride?.tier,
        overrideReason: trustOverride?.reason ?? undefined,
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
        repoSkillCount: skillPaths.length,
      }, now)

      const commits = await gitLog(dir, skillPath, 30)
      let modifiedAt: number | null = null
      if (commits[0])
        modifiedAt = epochOf(commits[0].date)
      for (const c of commits) {
        const occurredAt = epochOf(c.date)
        if (occurredAt == null)
          continue
        console.log(
          `INSERT OR IGNORE INTO skill_revisions (owner, name, sha, modified_at, author_login, message) VALUES (${sql(owner)}, ${sql(parsed.name)}, ${sql(c.sha)}, ${occurredAt}, ${sql(c.login || null)}, ${sql(c.message)});`,
        )
        revCount++
      }

      const skillTreeSha = await gitTreeSha(dir, skillPath)
      console.log(
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
         ) VALUES (
           ${sql(parsed.name)}, ${sql(owner)}, ${sql(repo)}, ${sql(parsed.displayName)}, 0, ${sql(`${owner}/${parsed.name}`)},
           ${stars}, ${forks}, ${nullable(repoPushedAt)}, ${nullable(repoCreatedAt)}, ${sql(description)}, ${sql(branch)},
           ${now}, NULL,
           ${sql(skillTreeSha)}, ${nullable(modifiedAt)}, ${now}, ${refsCount}, ${sql(JSON.stringify(assets))},
           ${now}, 'ok', ${sql(treeShaRoot)},
           ${isOfficial ? 1 : 0}, 1, ${indexability.score}, ${indexability.indexable ? 1 : 0},
           ${sql(JSON.stringify(indexability.reasons))}, ${now},
           ${sql(trust.tier)}, ${sql(trust.source)}, ${trust.score}, ${sql(JSON.stringify(trust.reasons))}, ${now},
           ${skillPaths.length}, ${sql(repoKind)}, ${sql(repoKindSource)}
         )
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
           seo_index_score = excluded.seo_index_score,
           seo_indexable = excluded.seo_indexable,
           seo_index_reasons = excluded.seo_index_reasons,
           seo_index_synced_at = excluded.seo_index_synced_at,
           trust_tier = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_tier ELSE skills.trust_tier END,
           trust_source = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_source ELSE skills.trust_source END,
           trust_score = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_score ELSE skills.trust_score END,
           trust_reasons = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_reasons ELSE skills.trust_reasons END,
           trust_synced_at = COALESCE(skills.trust_synced_at, excluded.trust_synced_at),
           repo_skill_count = excluded.repo_skill_count,
           repo_kind = CASE WHEN skills.repo_kind_source = 'override' THEN skills.repo_kind ELSE excluded.repo_kind END,
           repo_kind_source = skills.repo_kind_source;`,
      )
      skillCount++
    }

    if (seenNames.length) {
      const keep = seenNames.map(n => sql(n)).join(',')
      console.log(`DELETE FROM skills WHERE owner = ${sql(owner)} AND repo = ${sql(repo)} AND name NOT IN (${keep});`)
    }
    okCount++
    console.error(`  ✓ ${slug} (${seenNames.length} skills, ${(size / 1024 / 1024).toFixed(0)}MB clone)`)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Main
let top: TopRepo[]
if (EXPLICIT.length) {
  top = EXPLICIT.map((s) => { const [o, r] = s.split('/'); return { owner: o!, repo: r!, stars: 0 } })
  console.error(`[deep-sync-clone] ${top.length} explicit repos`)
}
else {
  console.error(`[deep-sync-clone] selecting top ${LIMIT} non-aggregator repos by stars (skipping synced <24h)...`)
  top = d1Query<TopRepo>(
    `SELECT owner, repo, MAX(stars) AS stars FROM skills
     WHERE repo_kind != 'aggregator' AND broken_since IS NULL
     GROUP BY owner, repo
     HAVING MAX(COALESCE(last_synced_at, 0)) < unixepoch() - 86400
     ORDER BY stars DESC LIMIT ${LIMIT};`,
  )
  console.error(`[deep-sync-clone] ${top.length} repos`)
}

console.error(`[deep-sync-clone] fetching repo meta via GraphQL...`)
const meta = fetchRepoMeta(top)

console.error(`[deep-sync-clone] loading overrides...`)
const trustOv = new Map<string, TrustOverride>()
for (const r of d1Query<TrustOverride & { owner: string, repo: string }>(`SELECT owner, repo, tier, reason FROM repo_trust_overrides;`))
  trustOv.set(`${r.owner}/${r.repo}`, { tier: r.tier, reason: r.reason })
const kindOv = new Map<string, KindOverride['kind']>()
for (const r of d1Query<{ owner: string, repo: string, kind: KindOverride['kind'] }>(`SELECT owner, repo, kind FROM repo_kind_overrides;`))
  kindOv.set(`${r.owner}/${r.repo}`, r.kind)

console.error(`[deep-sync-clone] starting ${top.length} repos at concurrency ${CONCURRENCY}...`)

let cursor = 0
async function worker(workerId: number) {
  while (true) {
    const i = cursor++
    if (i >= top.length)
      return
    const t = top[i]!
    try { await syncRepo(t, meta.get(`${t.owner}/${t.repo}`) ?? null, kindOv, trustOv) }
    catch (e) {
      console.error(`  ! ${t.owner}/${t.repo}: ${(e as Error).message?.slice(0, 200)}`)
      failCount++
    }
    if ((i + 1) % 10 === 0)
      console.error(`[deep-sync-clone] ${i + 1}/${top.length}`)
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)))

console.error(`[deep-sync-clone] done. ok=${okCount} fail=${failCount}; skills=${skillCount}, revisions=${revCount}`)
