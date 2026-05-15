/**
 * Recompute dormant trust tiers for every skill.
 *
 * This does not change sitemap/indexing behavior. It only writes trust_tier,
 * trust_source, trust_score, trust_reasons, and trust_synced_at so we can
 * inspect the corpus before switching policy.
 *
 * Preview distribution and update count:
 *   npx tsx scripts/recompute-skill-trust.ts
 *
 * Emit at most 5,000 changed-row updates:
 *   npx tsx scripts/recompute-skill-trust.ts --emit-sql \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 *
 * Raise the cap deliberately:
 *   npx tsx scripts/recompute-skill-trust.ts --emit-sql --limit 20000
 */

import type { SkillTrustSource, SkillTrustTier } from '../server/utils/skill-trust'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { resolveSkillTrust } from '../server/utils/skill-trust'

const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'
const EMIT_SQL = process.argv.includes('--emit-sql')
const FORCE = process.argv.includes('--force')
const DEFAULT_LIMIT = 5_000

function readLimit(): number {
  const eqArg = process.argv.find(a => a.startsWith('--limit='))
  if (eqArg)
    return Number.parseInt(eqArg.slice('--limit='.length), 10)
  const idx = process.argv.indexOf('--limit')
  if (idx >= 0)
    return Number.parseInt(process.argv[idx + 1] ?? '', 10)
  return DEFAULT_LIMIT
}

const LIMIT = readLimit()

function readSample(): number | null {
  const eqArg = process.argv.find(a => a.startsWith('--sample='))
  if (eqArg)
    return Number.parseInt(eqArg.slice('--sample='.length), 10)
  const idx = process.argv.indexOf('--sample')
  if (idx >= 0)
    return Number.parseInt(process.argv[idx + 1] ?? '', 10)
  return null
}

const SAMPLE = readSample()

interface SkillRow {
  owner: string
  repo: string
  name: string
  installs: number
  current_sha: string | null
  sync_status: string | null
  repo_skill_count: number
  curator_reason_count: number
  approved_social_count: number
  override_tier: SkillTrustTier | null
  override_reason: string | null
  trust_tier: SkillTrustTier | null
  trust_source: SkillTrustSource | null
  trust_score: number | null
  trust_reasons: string | null
  stored_repo_skill_count: number | null
}

const SQUOTE_RE = /'/g
const escape = (s: string) => s.replace(SQUOTE_RE, '\'\'')
const sqlString = (s: string) => `'${escape(s)}'`
const sqlJson = (v: unknown) => sqlString(JSON.stringify(v))

function sameJsonArray(a: string | null, b: string[]): boolean {
  return (a ?? '[]') === JSON.stringify(b)
}

function d1<T>(sql: string): T[] {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'skilld-db', '--remote', '--json', '--command', sql],
    {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
    },
  )
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

function tableExists(name: string): boolean {
  const rows = d1<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlString(name)}`)
  return rows.length > 0
}

function skillsColumns(): Set<string> {
  const rows = d1<{ name: string }>('PRAGMA table_info(skills)')
  return new Set(rows.map(r => r.name))
}

function main() {
  const hasOverrides = tableExists('repo_trust_overrides')
  const cols = skillsColumns()
  const trustFields = cols.has('trust_tier')
    ? `s.trust_tier, s.trust_source, s.trust_score, s.trust_reasons, r.repo_skill_count AS stored_repo_skill_count`
    : `'untrusted' AS trust_tier, 'computed' AS trust_source, 0 AS trust_score, '[]' AS trust_reasons, 0 AS stored_repo_skill_count`
  const overrideFields = hasOverrides
    ? `o.tier AS override_tier, o.reason AS override_reason`
    : `NULL AS override_tier, NULL AS override_reason`
  const overrideJoin = hasOverrides
    ? 'LEFT JOIN repo_trust_overrides o ON o.owner = s.owner AND o.repo = s.repo'
    : ''
  const limitClause = SAMPLE && Number.isFinite(SAMPLE) && SAMPLE > 0 ? `LIMIT ${SAMPLE}` : ''

  const rows = d1<SkillRow>(`
    WITH repo_counts AS (
      SELECT s.owner, s.repo, COUNT(*) AS repo_skill_count
      FROM skills s
      JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
      WHERE r.broken_since IS NULL
      GROUP BY s.owner, s.repo
    )
    SELECT
      s.owner,
      s.repo,
      s.name,
      s.installs,
      s.current_sha,
      s.sync_status,
      COALESCE(rc.repo_skill_count, 0) AS repo_skill_count,
      (
        SELECT COUNT(*)
        FROM collection_skills_v2 cs
        JOIN collections_v2 c ON c.id = cs.collection_id
        WHERE c.deleted_at IS NULL
          AND cs.name = s.name
          AND cs.owner = s.owner
          AND length(trim(COALESCE(cs.reason, ''))) >= 20
      ) AS curator_reason_count,
      (
        SELECT COUNT(*)
        FROM skill_social_posts sp
        WHERE sp.skill_slug = s.slug
          AND sp.status = 'approved'
      ) AS approved_social_count,
      ${overrideFields},
      ${trustFields}
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    LEFT JOIN repo_counts rc ON rc.owner = s.owner AND rc.repo = s.repo
    ${overrideJoin}
    ORDER BY s.installs DESC, r.stars DESC, s.owner ASC, s.name ASC
    ${limitClause}
  `)

  const now = Math.floor(Date.now() / 1000)
  const tiers = new Map<string, number>()
  const sources = new Map<string, number>()
  const updates: string[] = []

  for (const row of rows) {
    const sourceResolved = Boolean(row.current_sha && row.sync_status !== 'path_missing' && row.sync_status !== 'fetch_failed')
    const trust = resolveSkillTrust({
      owner: row.owner,
      repo: row.repo,
      sourceResolved,
      installs: row.installs,
      curatorReasonCount: row.curator_reason_count,
      approvedSocialCount: row.approved_social_count,
      repoSkillCount: row.repo_skill_count,
      overrideTier: row.override_tier,
      overrideReason: row.override_reason,
    })

    tiers.set(trust.tier, (tiers.get(trust.tier) ?? 0) + 1)
    sources.set(trust.source, (sources.get(trust.source) ?? 0) + 1)

    const changed = row.trust_tier !== trust.tier
      || row.trust_source !== trust.source
      || (row.trust_score ?? 0) !== trust.score
      || !sameJsonArray(row.trust_reasons, trust.reasons)
      || (row.stored_repo_skill_count ?? 0) !== row.repo_skill_count

    if (!changed)
      continue

    updates.push(
      `UPDATE skills SET `
      + `trust_tier = ${sqlString(trust.tier)}, `
      + `trust_source = ${sqlString(trust.source)}, `
      + `trust_score = ${trust.score}, `
      + `trust_reasons = ${sqlJson(trust.reasons)}, `
      + `trust_synced_at = ${now}, `
      + `repo_skill_count = ${row.repo_skill_count} `
      + `WHERE owner = ${sqlString(row.owner)} AND name = ${sqlString(row.name)};`,
    )
  }

  const tierDist = [...tiers.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')
  const sourceDist = [...sources.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')
  console.error(`[trust] rows=${rows.length} changed=${updates.length} emit=${EMIT_SQL ? 'yes' : 'no'} limit=${LIMIT} sample=${SAMPLE ?? 'all'} overrides=${hasOverrides ? 'yes' : 'no'} tiers=${tierDist} sources=${sourceDist}`)

  if (!EMIT_SQL)
    return

  if (!Number.isFinite(LIMIT) || LIMIT < 1) {
    console.error('[trust] Refusing to emit SQL: --limit must be a positive integer.')
    process.exit(1)
  }

  if (!FORCE && updates.length > LIMIT) {
    console.error(`[trust] Refusing to emit ${updates.length} updates over limit ${LIMIT}. Re-run with --limit ${updates.length} or --force.`)
    process.exit(1)
  }

  console.log('-- recompute-skill-trust')
  for (const update of updates)
    console.log(update)
}

main()
