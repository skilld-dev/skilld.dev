/// <reference types="@cloudflare/workers-types" />

/**
 * Shared recompute helpers for SEO indexability + trust scoring on skills.
 *
 * The two ad-hoc scripts in /scripts/recompute-skill-*.ts compute the same
 * scores by piping through wrangler. These helpers run the identical logic
 * directly against a D1Database binding so scheduled tasks can call them.
 *
 * - recomputeIndexabilityForSkill: per-skill, writes seo_* + trust_* columns.
 * - recomputeTrustForSkill:        per-skill, writes only trust_* columns.
 * - recomputeAllSkillScores:       full-table pass for both, used by the
 *   daily scheduled task.
 *
 * Scoring math itself lives in ./skill-indexability and ./skill-trust; this
 * module is purely the data-access + UPDATE glue.
 */

import type { SkillIndexabilityResult } from './skill-indexability'
import type { SkillTrustResult, SkillTrustSource, SkillTrustTier } from './skill-trust'
import { isOfficialSkillRepo, scoreSkillIndexability } from './skill-indexability'
import { resolveSkillTrust } from './skill-trust'

export interface SkillKey {
  owner: string
  repo: string
  name: string
}

interface ScoreRow {
  owner: string
  repo: string
  name: string
  installs: number
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
}

const BASE_SELECT = `
  s.owner,
  s.repo,
  s.name,
  s.installs,
  r.stars,
  r.pushed_at,
  s.description,
  s.current_sha,
  s.sync_status,
  s.references_count,
  s.is_official,
  s.owner_verified,
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
  o.tier AS override_tier,
  o.reason AS override_reason,
  (
    SELECT COUNT(*)
    FROM collection_skills_v2 cs
    JOIN collections_v2 c ON c.id = cs.collection_id
    WHERE c.deleted_at IS NULL
      AND cs.name = s.name
      AND cs.owner = s.owner
  ) AS curator_count,
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
  (
    SELECT COUNT(*)
    FROM skill_social_posts sp
    WHERE sp.skill_slug = s.slug
      AND sp.status = 'approved'
      AND sp.role = 'author'
  ) AS author_social_count,
  COALESCE((
    SELECT COUNT(*)
    FROM skills s2
    JOIN repos r2 ON r2.owner = s2.owner AND r2.repo = s2.repo
    WHERE s2.owner = s.owner AND s2.repo = s.repo AND r2.broken_since IS NULL
  ), 0) AS repo_skill_count
`

const FROM_JOIN = `
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  LEFT JOIN repo_trust_overrides o ON o.owner = s.owner AND o.repo = s.repo
`

function computeFromRow(row: ScoreRow, now: number): {
  isOfficial: boolean
  sourceResolved: boolean
  trust: SkillTrustResult
  scored: SkillIndexabilityResult
} {
  const isOfficial = isOfficialSkillRepo(row.owner, row.repo)
  const sourceResolved = Boolean(
    row.current_sha
    && row.sync_status !== 'path_missing'
    && row.sync_status !== 'fetch_failed',
  )
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
  const scored = scoreSkillIndexability({
    isOfficial,
    ownerVerified: row.owner_verified === 1,
    sourceResolved,
    trustTier: trust.tier,
    curatorCount: row.curator_count,
    curatorReasonCount: row.curator_reason_count,
    approvedSocialCount: row.approved_social_count,
    authorSocialCount: row.author_social_count,
    installs: row.installs,
    stars: row.stars,
    pushedAt: row.pushed_at,
    referencesCount: row.references_count ?? 0,
    description: row.description,
    repoSkillCount: row.repo_skill_count,
  }, now)
  return { isOfficial, sourceResolved, trust, scored }
}

function sameJsonArray(a: string | null, b: string[]): boolean {
  return (a ?? '[]') === JSON.stringify(b)
}

function indexabilityChanged(
  row: ScoreRow,
  isOfficial: boolean,
  sourceResolved: boolean,
  trust: SkillTrustResult,
  scored: SkillIndexabilityResult,
): boolean {
  return (row.is_official ?? 0) !== (isOfficial ? 1 : 0)
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
}

function trustChanged(row: ScoreRow, trust: SkillTrustResult): boolean {
  return row.trust_tier !== trust.tier
    || row.trust_source !== trust.source
    || (row.trust_score ?? 0) !== trust.score
    || !sameJsonArray(row.trust_reasons, trust.reasons)
}

function updateIndexabilityStmt(
  db: D1Database,
  row: ScoreRow,
  isOfficial: boolean,
  sourceResolved: boolean,
  trust: SkillTrustResult,
  scored: SkillIndexabilityResult,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE skills SET
         is_official = ?1,
         source_resolved = ?2,
         curator_count = ?3,
         curator_reason_count = ?4,
         approved_social_count = ?5,
         author_social_count = ?6,
         seo_index_score = ?7,
         seo_indexable = ?8,
         seo_index_reasons = ?9,
         seo_index_synced_at = ?10,
         trust_tier = ?11,
         trust_source = ?12,
         trust_score = ?13,
         trust_reasons = ?14,
         trust_synced_at = ?10
       WHERE owner = ?15 AND name = ?16`,
    )
    .bind(
      isOfficial ? 1 : 0,
      sourceResolved ? 1 : 0,
      row.curator_count,
      row.curator_reason_count,
      row.approved_social_count,
      row.author_social_count,
      scored.score,
      scored.indexable ? 1 : 0,
      JSON.stringify(scored.reasons),
      now,
      trust.tier,
      trust.source,
      trust.score,
      JSON.stringify(trust.reasons),
      row.owner,
      row.name,
    )
}

function updateTrustStmt(
  db: D1Database,
  row: ScoreRow,
  trust: SkillTrustResult,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE skills SET
         trust_tier = ?1,
         trust_source = ?2,
         trust_score = ?3,
         trust_reasons = ?4,
         trust_synced_at = ?5
       WHERE owner = ?6 AND name = ?7`,
    )
    .bind(
      trust.tier,
      trust.source,
      trust.score,
      JSON.stringify(trust.reasons),
      now,
      row.owner,
      row.name,
    )
}

async function fetchOne(db: D1Database, key: SkillKey): Promise<ScoreRow | null> {
  const row = await db
    .prepare(`SELECT ${BASE_SELECT} ${FROM_JOIN} WHERE s.owner = ?1 AND s.repo = ?2 AND s.name = ?3 LIMIT 1`)
    .bind(key.owner, key.repo, key.name)
    .first<ScoreRow>()
  return row ?? null
}

export async function recomputeIndexabilityForSkill(db: D1Database, key: SkillKey): Promise<void> {
  const row = await fetchOne(db, key)
  if (!row)
    return
  const now = Math.floor(Date.now() / 1000)
  const { isOfficial, sourceResolved, trust, scored } = computeFromRow(row, now)
  if (!indexabilityChanged(row, isOfficial, sourceResolved, trust, scored))
    return
  await updateIndexabilityStmt(db, row, isOfficial, sourceResolved, trust, scored, now).run()
}

export async function recomputeTrustForSkill(db: D1Database, key: SkillKey): Promise<void> {
  const row = await fetchOne(db, key)
  if (!row)
    return
  const now = Math.floor(Date.now() / 1000)
  const { trust } = computeFromRow(row, now)
  if (!trustChanged(row, trust))
    return
  await updateTrustStmt(db, row, trust, now).run()
}

export interface RecomputeAllResult {
  scanned: number
  indexabilityUpdated: number
  trustUpdated: number
}

/**
 * Full-table recompute. Single SELECT pulls every skill + its live counts,
 * then issues one UPDATE per changed row. Indexability changes always
 * include trust columns (they're written together), so trustUpdated only
 * counts rows where trust changed but indexability didn't.
 */
export async function recomputeAllSkillScores(
  db: D1Database,
  opts: { limit?: number } = {},
): Promise<RecomputeAllResult> {
  const limitClause = opts.limit && Number.isFinite(opts.limit) && opts.limit > 0
    ? `LIMIT ${Math.floor(opts.limit)}`
    : ''

  const res = await db
    .prepare(
      `SELECT ${BASE_SELECT} ${FROM_JOIN}
       ORDER BY s.installs DESC, r.stars DESC, s.owner ASC, s.name ASC
       ${limitClause}`,
    )
    .all<ScoreRow>()

  const rows = res.results ?? []
  const now = Math.floor(Date.now() / 1000)
  let indexabilityUpdated = 0
  let trustUpdated = 0

  for (const row of rows) {
    const { isOfficial, sourceResolved, trust, scored } = computeFromRow(row, now)
    if (indexabilityChanged(row, isOfficial, sourceResolved, trust, scored)) {
      await updateIndexabilityStmt(db, row, isOfficial, sourceResolved, trust, scored, now).run()
      indexabilityUpdated++
    }
    else if (trustChanged(row, trust)) {
      await updateTrustStmt(db, row, trust, now).run()
      trustUpdated++
    }
  }

  return { scanned: rows.length, indexabilityUpdated, trustUpdated }
}
