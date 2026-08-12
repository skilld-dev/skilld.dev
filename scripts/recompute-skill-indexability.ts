/**
 * Recompute denormalized SEO indexability signals for every skill.
 *
 * Preview distribution and update count:
 *   npx tsx scripts/recompute-skill-indexability.ts
 *
 * Emit at most 5,000 changed-row updates:
 *   npx tsx scripts/recompute-skill-indexability.ts --emit-sql \
 *     | npx wrangler d1 execute skilld-db --remote --file=-
 *
 * Raise the cap deliberately:
 *   npx tsx scripts/recompute-skill-indexability.ts --emit-sql --limit 20000
 */

import type { SkillTrustSource, SkillTrustTier } from '../layers/registry/server/utils/skill-trust'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { isCategoryPinned } from '../layers/registry/server/data/clusters'
import { isOfficialSkillRepo, scoreSkillIndexability } from '../layers/registry/server/utils/skill-indexability'
import { resolveSkillTrust } from '../layers/registry/server/utils/skill-trust'

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
  stars: number
  pushed_at: number | null
  description: string | null
  current_sha: string | null
  sync_status: string | null
  references_count: number | null
  curator_count: number
  curator_reason_count: number
  approved_social_count: number
  author_social_count: number
  repo_skill_count: number
  override_tier: SkillTrustTier | null
  override_reason: string | null
  is_official: number | null
  owner_verified: number | null
  source_resolved: number | null
  stored_curator_count: number | null
  stored_curator_reason_count: number | null
  stored_approved_social_count: number | null
  stored_author_social_count: number | null
  seo_index_score: number | null
  seo_indexable: number | null
  seo_index_reasons: string | null
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
  const storedSeoFields = cols.has('seo_index_score')
    ? `s.is_official,
      s.source_resolved,
      s.curator_count AS stored_curator_count,
      s.curator_reason_count AS stored_curator_reason_count,
      s.approved_social_count AS stored_approved_social_count,
      s.author_social_count AS stored_author_social_count,
      s.seo_index_score,
      s.seo_indexable,
      s.seo_index_reasons,
      s.trust_tier,
      s.trust_source,
      s.trust_score,
      s.trust_reasons,
      r.repo_skill_count AS stored_repo_skill_count`
    : `0 AS is_official,
      0 AS source_resolved,
      0 AS stored_curator_count,
      0 AS stored_curator_reason_count,
      0 AS stored_approved_social_count,
      0 AS stored_author_social_count,
      0 AS seo_index_score,
      0 AS seo_indexable,
      '[]' AS seo_index_reasons,
      'untrusted' AS trust_tier,
      'computed' AS trust_source,
      0 AS trust_score,
      '[]' AS trust_reasons,
      0 AS stored_repo_skill_count`
  const overrideFields = hasOverrides
    ? `ro.tier AS override_tier, ro.reason AS override_reason`
    : `NULL AS override_tier, NULL AS override_reason`
  const overrideJoin = hasOverrides
    ? 'LEFT JOIN repo_trust_overrides ro ON ro.owner = s.owner AND ro.repo = s.repo'
    : ''
  const ownerVerifiedField = cols.has('owner_verified') ? 's.owner_verified' : '0 AS owner_verified'
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
      r.stars,
      r.pushed_at,
      s.description,
      s.current_sha,
      s.sync_status,
      s.references_count,
      ${ownerVerifiedField},
      COALESCE(rc.repo_skill_count, 0) AS repo_skill_count,
      ${overrideFields},
      ${storedSeoFields},
      (
        SELECT COUNT(*)
        FROM collection_skills_v2 cs
        JOIN collections_v2 c ON c.id = cs.collection_id
        WHERE c.deleted_at IS NULL
          AND cs.name = s.name
          AND cs.owner = s.owner
          AND cs.repo = s.repo
      ) AS curator_count,
      (
        SELECT COUNT(*)
        FROM collection_skills_v2 cs
        JOIN collections_v2 c ON c.id = cs.collection_id
        WHERE c.deleted_at IS NULL
          AND cs.name = s.name
          AND cs.owner = s.owner
          AND cs.repo = s.repo
          AND length(trim(COALESCE(cs.reason, ''))) >= 20
      ) AS curator_reason_count,
      (
        SELECT COUNT(*)
        FROM skill_social_posts sp
        WHERE sp.skill_slug = s.slug
          AND sp.status = 'approved'
      ) AS approved_social_count,
      (
        SELECT COUNT(*)
        FROM skill_social_posts sp
        WHERE sp.skill_slug = s.slug
          AND sp.status = 'approved'
          AND sp.role = 'author'
      ) AS author_social_count
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    LEFT JOIN repo_counts rc ON rc.owner = s.owner AND rc.repo = s.repo
    ${overrideJoin}
    ORDER BY r.stars DESC, s.owner ASC, s.name ASC
    ${limitClause}
  `)

  const now = Math.floor(Date.now() / 1000)
  const histogram = new Map<number, number>()
  const trustHistogram = new Map<string, number>()
  let indexable = 0
  const updates: string[] = []

  for (const row of rows) {
    const isOfficial = isOfficialSkillRepo(row.owner, row.repo)
    const sourceResolved = Boolean(row.current_sha && row.sync_status !== 'path_missing' && row.sync_status !== 'fetch_failed')
    const trust = resolveSkillTrust({
      owner: row.owner,
      repo: row.repo,
      sourceResolved,
      stars: row.stars,
      curatorReasonCount: row.curator_reason_count,
      approvedSocialCount: row.approved_social_count,
      repoSkillCount: row.repo_skill_count,
      overrideTier: row.override_tier,
      overrideReason: row.override_reason,
    })
    const scored = scoreSkillIndexability({
      isOfficial,
      ownerVerified: row.owner_verified === 1,
      sourceResolved,
      trustTier: trust.tier,
      curatorCount: row.curator_count,
      curatorReasonCount: row.curator_reason_count,
      categoryPinned: isCategoryPinned(row.owner, row.name),
      approvedSocialCount: row.approved_social_count,
      authorSocialCount: row.author_social_count,
      stars: row.stars,
      pushedAt: row.pushed_at,
      referencesCount: row.references_count ?? 0,
      description: row.description,
      repoSkillCount: row.repo_skill_count,
    }, now)

    histogram.set(scored.score, (histogram.get(scored.score) ?? 0) + 1)
    trustHistogram.set(trust.tier, (trustHistogram.get(trust.tier) ?? 0) + 1)
    if (scored.indexable)
      indexable++

    const changed = (row.is_official ?? 0) !== (isOfficial ? 1 : 0)
      || (row.source_resolved ?? 0) !== (sourceResolved ? 1 : 0)
      || (row.stored_curator_count ?? 0) !== row.curator_count
      || (row.stored_curator_reason_count ?? 0) !== row.curator_reason_count
      || (row.stored_approved_social_count ?? 0) !== row.approved_social_count
      || (row.stored_author_social_count ?? 0) !== row.author_social_count
      || (row.seo_index_score ?? 0) !== scored.score
      || (row.seo_indexable ?? 0) !== (scored.indexable ? 1 : 0)
      || !sameJsonArray(row.seo_index_reasons, scored.reasons)
      || row.trust_tier !== trust.tier
      || row.trust_source !== trust.source
      || (row.trust_score ?? 0) !== trust.score
      || !sameJsonArray(row.trust_reasons, trust.reasons)

    if (!changed)
      continue

    updates.push(
      `UPDATE skills SET `
      + `is_official = ${isOfficial ? 1 : 0}, `
      + `source_resolved = ${sourceResolved ? 1 : 0}, `
      + `curator_count = ${row.curator_count}, `
      + `curator_reason_count = ${row.curator_reason_count}, `
      + `approved_social_count = ${row.approved_social_count}, `
      + `author_social_count = ${row.author_social_count}, `
      + `seo_index_score = ${scored.score}, `
      + `seo_indexable = ${scored.indexable ? 1 : 0}, `
      + `seo_index_reasons = ${sqlJson(scored.reasons)}, `
      + `seo_index_synced_at = ${now}, `
      + `trust_tier = ${sqlString(trust.tier)}, `
      + `trust_source = ${sqlString(trust.source)}, `
      + `trust_score = ${trust.score}, `
      + `trust_reasons = ${sqlJson(trust.reasons)}, `
      + `trust_synced_at = ${now} `
      // `repo_skill_count` lives on `repos`, not `skills`; setting it here made
      // every emitted statement fail with "no such column".
      //
      // `repo` belongs in the key. A skill is (owner, repo, name), so matching
      // on owner+name alone overwrote every same-named skill the owner has in
      // any other repo with this row's scores.
      + `WHERE owner = ${sqlString(row.owner)} AND repo = ${sqlString(row.repo)} AND name = ${sqlString(row.name)};`,
    )
  }

  const dist = [...histogram.entries()].sort((a, b) => b[0] - a[0]).map(([score, count]) => `${score}:${count}`).join(' ')
  const trustDist = [...trustHistogram.entries()].sort((a, b) => b[1] - a[1]).map(([tier, count]) => `${tier}:${count}`).join(' ')
  console.error(`[indexability] rows=${rows.length} changed=${updates.length} indexable=${indexable} emit=${EMIT_SQL ? 'yes' : 'no'} limit=${LIMIT} sample=${SAMPLE ?? 'all'} overrides=${hasOverrides ? 'yes' : 'no'} distribution=${dist} trust=${trustDist}`)

  if (!EMIT_SQL)
    return

  if (!Number.isFinite(LIMIT) || LIMIT < 1) {
    console.error('[indexability] Refusing to emit SQL: --limit must be a positive integer.')
    process.exit(1)
  }

  if (!FORCE && updates.length > LIMIT) {
    console.error(`[indexability] Refusing to emit ${updates.length} updates over limit ${LIMIT}. Re-run with --limit ${updates.length} or --force.`)
    process.exit(1)
  }

  console.log('-- recompute-skill-indexability')
  for (const update of updates)
    console.log(update)
}

main()
