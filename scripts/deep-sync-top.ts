/**
 * Deep-sync top-N repos by stars locally; emit SQL for skills + skill_revisions.
 *
 * Mirrors layers/registry/server/utils/sync-repo.ts:syncRepo() but writes SQL
 * to stdout instead of D1.bind/.run, so we can capture results from a Node
 * environment and apply them in bulk to remote D1.
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) npx tsx scripts/deep-sync-top.ts --limit 100 > /tmp/deep-top100.sql
 *   wrangler d1 execute skilld-db --remote --file /tmp/deep-top100.sql
 *
 * Notes:
 * - Uses repo_kind != 'aggregator' as the filter (no point deep-syncing awesome-lists).
 * - Skips activity emission (we can't tell "new" vs "existing" without a DB roundtrip per skill).
 * - Honours repo_trust_overrides + repo_kind_overrides via lookups against remote D1.
 */

import type { SkillTrustTier } from '~~/layers/registry/server/utils/skill-trust'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { getCommits, getRawFile, getRepo, getTree } from '~~/layers/registry/server/utils/github-client'
import { parseSkillFile } from '~~/layers/registry/server/utils/skill-frontmatter'
import { isOfficialSkillRepo, scoreSkillIndexability } from '~~/layers/registry/server/utils/skill-indexability'
import { resolveSkillTrust } from '~~/layers/registry/server/utils/skill-trust'

interface TopRepo {
  owner: string
  repo: string
  stars: number
}

interface KindOverride { kind: 'creator' | 'catalog' | 'aggregator' }
interface TrustOverride { tier: SkillTrustTier, reason: string | null }

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1] ?? '100', 10) : 100
const reposIdx = args.indexOf('--repos')
const EXPLICIT_REPOS = reposIdx >= 0 ? (args[reposIdx + 1] ?? '').split(',').filter(Boolean) : []
const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('GITHUB_TOKEN required')
  process.exit(1)
}
const BINDINGS = { GITHUB_TOKEN: TOKEN }
const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function getRepoWithRetry(owner: string, repo: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await getRepo(owner, repo, BINDINGS)
    if (res.status === 403 || res.status === 429) {
      const wait = 5000 * (attempt + 1)
      console.error(`  ~ ${res.status} on ${owner}/${repo}, sleeping ${wait}ms (attempt ${attempt + 1}/3)`)
      await sleep(wait)
      continue
    }
    return res
  }
  return await getRepo(owner, repo, BINDINGS)
}

async function getTreeWithRetry(owner: string, repo: string, branch: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await getTree(owner, repo, branch, BINDINGS)
    if (res.status === 403 || res.status === 429) {
      const wait = 5000 * (attempt + 1)
      console.error(`  ~ tree ${res.status} on ${owner}/${repo}, sleeping ${wait}ms (attempt ${attempt + 1}/3)`)
      await sleep(wait)
      continue
    }
    return res
  }
  return await getTree(owner, repo, branch, BINDINGS)
}

function d1Query<T>(sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', sql],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID } },
  )
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

const SQUOTE_RE = /'/g
const sql = (s: string | null | undefined) => s == null ? 'NULL' : `'${s.replace(SQUOTE_RE, '\'\'')}'`
const epoch = (iso: string | null | undefined) => iso ? Math.floor(new Date(iso).getTime() / 1000) : null
const nullable = (n: number | null | undefined) => n == null ? 'NULL' : String(n)

function dirNameFromSkillPath(path: string): string | null {
  const segs = path.split('/')
  return segs.length >= 2 ? segs[segs.length - 2] ?? null : null
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
function collectAssets(tree: { path: string, type: string, size?: number }[], skillDir: string) {
  const prefix = `${skillDir}/`
  const out: { path: string, size: number, type: string }[] = []
  for (const e of tree) {
    if (e.type !== 'blob' || !e.path.startsWith(prefix))
      continue
    const rel = e.path.slice(prefix.length)
    if (!rel || rel === 'SKILL.md' || ASSET_IGNORE.test(rel))
      continue
    out.push({ path: rel, size: e.size ?? 0, type: classifyAsset(rel) })
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  // D1 has a per-statement size limit (~100KB). Some repos (e.g. prowler-cloud)
  // have massive trees under their SKILL.md dirs. Cap to keep INSERT under it.
  return out.slice(0, 100)
}

function classifyRepoKind(n: number): 'creator' | 'catalog' | 'aggregator' {
  if (n > 100)
    return 'aggregator'
  if (n > 5)
    return 'catalog'
  return 'creator'
}

let top: TopRepo[]
if (EXPLICIT_REPOS.length) {
  top = EXPLICIT_REPOS.map((slug) => {
    const [owner, repo] = slug.split('/') as [string, string]
    return { owner, repo, stars: 0 }
  })
  console.error(`[deep-sync] ${top.length} explicit repos provided`)
}
else {
  console.error(`[deep-sync] selecting top ${LIMIT} non-aggregator repos by stars (skipping synced in last 24h)...`)
  // Pick repos where the freshest skill is older than 24h, so consecutive runs
  // walk further down the stars list instead of redoing the same head.
  // Repo-level filters (repo_kind, broken_since, stars) live on `repos`; the
  // last_synced_at gate is per-skill on `skills`.
  top = d1Query<TopRepo>(
    `SELECT r.owner AS owner, r.repo AS repo, r.stars AS stars
     FROM repos r
     JOIN skills s ON s.owner = r.owner AND s.repo = r.repo
     WHERE r.repo_kind != 'aggregator' AND r.broken_since IS NULL
     GROUP BY r.owner, r.repo
     HAVING MAX(COALESCE(s.last_synced_at, 0)) < unixepoch() - 86400
     ORDER BY r.stars DESC LIMIT ${LIMIT};`,
  )
  console.error(`[deep-sync] ${top.length} repos selected`)
}

console.error(`[deep-sync] loading kind/trust overrides...`)
const trustOverrides = new Map<string, TrustOverride>()
for (const r of d1Query<TrustOverride & { owner: string, repo: string }>(`SELECT owner, repo, tier, reason FROM repo_trust_overrides;`)) {
  trustOverrides.set(`${r.owner}/${r.repo}`, { tier: r.tier, reason: r.reason })
}
const kindOverrides = new Map<string, KindOverride['kind']>()
for (const r of d1Query<{ owner: string, repo: string, kind: KindOverride['kind'] }>(`SELECT owner, repo, kind FROM repo_kind_overrides;`)) {
  kindOverrides.set(`${r.owner}/${r.repo}`, r.kind)
}

let okCount = 0
let failCount = 0
let skillCount = 0
let revCount = 0

for (const { owner, repo } of top) {
  const slug = `${owner}/${repo}`
  console.error(`[deep-sync] ${slug}`)

  const repoRes = await getRepoWithRetry(owner, repo)
  if (!repoRes.data) {
    console.error(`  ! repo fetch ${repoRes.status}`)
    if (repoRes.status === 404) {
      const nowEpoch = Math.floor(Date.now() / 1000)
      console.log(`UPDATE repos SET broken_since = ${nowEpoch} WHERE owner = ${sql(owner)} AND repo = ${sql(repo)} AND broken_since IS NULL;`)
    }
    failCount++
    continue
  }
  const meta = repoRes.data
  const branch = meta.default_branch || 'main'

  const treeRes = await getTreeWithRetry(owner, repo, branch)
  if (!treeRes.data) {
    console.error(`  ! tree fetch ${treeRes.status}`)
    failCount++
    continue
  }
  const tree = treeRes.data
  const skillFiles = tree.tree
    .filter(e => e.type === 'blob' && e.path.endsWith('/SKILL.md'))
    .map(e => ({ path: e.path, dirName: dirNameFromSkillPath(e.path)!, treeSha: e.sha }))
    .filter(f => f.dirName)

  if (!skillFiles.length) {
    console.error(`  - no SKILL.md files`)
    continue
  }

  const now = Math.floor(Date.now() / 1000)
  const stars = meta.stargazers_count ?? 0
  const forks = meta.forks_count ?? 0
  const repoPushedAt = epoch(meta.pushed_at)
  const repoCreatedAt = epoch(meta.created_at)
  const repoDescription = meta.description?.trim() || null
  const trustOverride = trustOverrides.get(slug)
  const kindOverride = kindOverrides.get(slug)
  const repoKind = kindOverride ?? classifyRepoKind(skillFiles.length)
  const repoKindSource = kindOverride ? 'override' : 'computed'

  console.log(`-- ${slug} (${skillFiles.length} skills, ${stars} stars, kind=${repoKind})`)

  // Repo-level upsert (post-0034). Skills upsert below writes only skill cols.
  console.log(
    `INSERT INTO repos (
       owner, repo, default_branch, stars, forks, pushed_at, repo_created_at,
       repo_meta_synced_at, last_tree_sha, repo_kind, repo_kind_source,
       repo_skill_count, broken_since
     ) VALUES (
       ${sql(owner)}, ${sql(repo)}, ${sql(branch)}, ${stars}, ${forks},
       ${nullable(repoPushedAt)}, ${nullable(repoCreatedAt)}, ${now},
       ${sql(tree.sha)}, ${sql(repoKind)}, ${sql(repoKindSource)},
       ${skillFiles.length}, NULL
     )
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
       broken_since = NULL;`,
  )

  const seenNames: string[] = []

  for (const file of skillFiles) {
    const raw = (await getRawFile(owner, repo, branch, file.path, BINDINGS)) ?? ''
    const parsed = parseSkillFile(raw, file.dirName)
    if (!parsed)
      continue
    seenNames.push(parsed.name)

    const assets = collectAssets(tree.tree, file.dirName)
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
      repoSkillCount: skillFiles.length,
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
      repoSkillCount: skillFiles.length,
    }, now)

    let modifiedAt: number | null = null
    const commitsRes = await getCommits(owner, repo, { path: file.path, perPage: 30 }, BINDINGS)
    const commits = commitsRes.data ?? []
    if (commits[0])
      modifiedAt = epoch(commits[0].commit.author.date)
    for (const c of commits) {
      const occurredAt = epoch(c.commit.author.date)
      if (occurredAt == null)
        continue
      console.log(
        `INSERT OR IGNORE INTO skill_revisions (owner, repo, name, sha, modified_at, author_login, message) VALUES (${sql(owner)}, ${sql(repo)}, ${sql(parsed.name)}, ${sql(c.sha)}, ${occurredAt}, ${sql(c.author?.login ?? null)}, ${sql(c.commit.message)});`,
      )
      revCount++
    }

    console.log(
      `INSERT INTO skills (
         name, owner, repo, display_name, installs, slug, description,
         current_sha, modified_at, first_seen_at, references_count, assets,
         last_synced_at, sync_status,
         is_official, source_resolved, seo_index_score, seo_indexable,
         seo_index_reasons, seo_index_synced_at,
         trust_tier, trust_source, trust_score, trust_reasons, trust_synced_at
       ) VALUES (
         ${sql(parsed.name)}, ${sql(owner)}, ${sql(repo)}, ${sql(parsed.displayName)}, 0, ${sql(`${owner}/${parsed.name}`)}, ${sql(description)},
         ${sql(file.treeSha)}, ${nullable(modifiedAt)}, ${now}, ${refsCount}, ${sql(JSON.stringify(assets))},
         ${now}, 'ok',
         ${isOfficial ? 1 : 0}, 1, ${indexability.score}, ${indexability.indexable ? 1 : 0},
         ${sql(JSON.stringify(indexability.reasons))}, ${now},
         ${sql(trust.tier)}, ${sql(trust.source)}, ${trust.score}, ${sql(JSON.stringify(trust.reasons))}, ${now}
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
         seo_index_score = excluded.seo_index_score,
         seo_indexable = excluded.seo_indexable,
         seo_index_reasons = excluded.seo_index_reasons,
         seo_index_synced_at = excluded.seo_index_synced_at,
         trust_tier = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_tier ELSE skills.trust_tier END,
         trust_source = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_source ELSE skills.trust_source END,
         trust_score = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_score ELSE skills.trust_score END,
         trust_reasons = CASE WHEN skills.trust_synced_at IS NULL THEN excluded.trust_reasons ELSE skills.trust_reasons END,
         trust_synced_at = COALESCE(skills.trust_synced_at, excluded.trust_synced_at);`,
    )
    skillCount++
  }

  // Prune skills no longer present in the tree.
  const keepNames = seenNames.map(n => sql(n)).join(',')
  if (keepNames)
    console.log(`DELETE FROM skills WHERE owner = ${sql(owner)} AND repo = ${sql(repo)} AND name NOT IN (${keepNames});`)
  okCount++
}

console.error(`[deep-sync] done. repos ok=${okCount} fail=${failCount}; skills emitted=${skillCount}; revisions emitted=${revCount}`)
