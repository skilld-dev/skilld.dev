import {
  BROKEN_GRACE_SECONDS,
  STALE_INDEXABILITY_SECONDS,
  STALE_SYNC_SECONDS,
} from '~~/server/utils/sync-thresholds'
import { defineApiHandler } from '#shared/server/handler'

type Severity = 'critical' | 'warning' | 'info'

interface CountRow {
  count: number
}

interface SkillIssueRow {
  slug: string | null
  owner: string | null
  repo: string | null
  name: string | null
  display_name: string | null
  value: string | number | null
}

interface SkillIssue {
  slug: string | null
  owner: string | null
  repo: string | null
  name: string | null
  displayName: string | null
  value: string | number | null
  detail: string
}

interface IntegrityCheck {
  id: string
  label: string
  severity: Severity
  count: number
  description: string
  issues: SkillIssue[]
}

interface DistributionItem {
  label: string
  count: number
}

const ISSUE_LIMIT = 25

interface AiSpendRow {
  total_usd: number | null
  batch_count: number | null
  input_tokens: number | null
  output_tokens: number | null
}

interface RecentRegenRow {
  owner: string
  repo: string
  name: string
  generated_at: number
}

interface AiSpendSummary {
  windowDays: number
  totalUsd: number
  batchCount: number
  inputTokens: number
  outputTokens: number
  recentRegenerations: Array<{ owner: string, repo: string, name: string, generatedAt: number }>
}

interface SyncJobRow {
  name: string
  cron: string
  enabled: number
  stale_after_seconds: number | null
  last_run_at: number | null
  last_status: string | null
  last_error: string | null
  last_duration_ms: number | null
  run_count: number
}

/**
 * Approximate seconds between fires for a cron expression. We only need a
 * coarse staleness budget (2x interval) for /admin/integrity, not a real
 * cron engine, so the supported set is small: '0 * * * *' (hourly),
 * '*\/N * * * *' (every N min), and daily '0 H * * *'.
 */
function cronIntervalSeconds(cron: string): number {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5)
    return 3600
  const minute = parts[0] ?? ''
  const hour = parts[1] ?? ''
  if (minute.startsWith('*/')) {
    const n = Number.parseInt(minute.slice(2), 10)
    if (Number.isFinite(n) && n > 0)
      return n * 60
  }
  if (minute === '*')
    return 60
  if (hour === '*')
    return 3600
  return 86400
}

function mapIssue(row: SkillIssueRow, detail: string): SkillIssue {
  return {
    slug: row.slug,
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    displayName: row.display_name,
    value: row.value,
    detail,
  }
}

async function firstCount(db: D1Database, sql: string): Promise<number> {
  const row = await db.prepare(sql).first<CountRow>()
  return row?.count ?? 0
}

async function distribution(db: D1Database, sql: string): Promise<DistributionItem[]> {
  const rows = await db.prepare(sql).all<{ label: string | number | null, count: number }>()
  return (rows.results ?? []).map(row => ({
    label: String(row.label ?? 'unknown'),
    count: row.count,
  }))
}

async function buildCheck(
  db: D1Database,
  input: {
    id: string
    label: string
    severity: Severity
    description: string
    countSql: string
    issuesSql: string
    detail: string
  },
): Promise<IntegrityCheck> {
  const [count, rows] = await Promise.all([
    firstCount(db, input.countSql),
    db.prepare(input.issuesSql).bind(ISSUE_LIMIT).all<SkillIssueRow>(),
  ])

  return {
    id: input.id,
    label: input.label,
    severity: input.severity,
    count,
    description: input.description,
    issues: (rows.results ?? []).map(row => mapIssue(row, input.detail)),
  }
}

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    await requireAdmin(event)

    const db = platform.db
    const now = Math.floor(Date.now() / 1000)
    const staleBefore = now - STALE_SYNC_SECONDS
    const brokenVisibleCutoff = now - BROKEN_GRACE_SECONDS
    const staleIndexabilityBefore = now - STALE_INDEXABILITY_SECONDS
    const schemaColumns = await db.prepare('PRAGMA table_info(skills)').all<{ name: string }>()
    const skillColumns = new Set((schemaColumns.results ?? []).map(column => column.name))
    const hasIndexabilityColumns = [
      'is_official',
      'source_resolved',
      'curator_count',
      'curator_reason_count',
      'approved_social_count',
      'author_social_count',
      'seo_index_score',
      'seo_indexable',
      'seo_index_reasons',
      'seo_index_synced_at',
    ].every(column => skillColumns.has(column))
    const hasTrustColumns = [
      'trust_tier',
      'trust_source',
      'trust_score',
      'trust_reasons',
      'trust_synced_at',
      'repo_skill_count',
    ].every(column => skillColumns.has(column))

    if (!hasIndexabilityColumns) {
      const [totalSkills, visibleSkills, brokenSkills] = await Promise.all([
        firstCount(db, 'SELECT COUNT(*) AS count FROM skills'),
        firstCount(db, `SELECT COUNT(*) AS count FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo WHERE r.broken_since IS NULL OR r.broken_since > ${brokenVisibleCutoff}`),
        firstCount(db, 'SELECT COUNT(*) AS count FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo WHERE r.broken_since IS NOT NULL'),
      ])

      return {
        generatedAt: new Date().toISOString(),
        metrics: [
          {
            label: 'Total skills',
            value: totalSkills,
            tone: 'ok',
            help: 'All registry rows, including broken rows.',
          },
          {
            label: 'Visible skills',
            value: visibleSkills,
            tone: 'ok',
            help: 'Rows eligible for listings without the indexability migration.',
          },
          {
            label: 'Broken skills',
            value: brokenSkills,
            tone: brokenSkills ? 'critical' : 'ok',
            help: 'Rows with broken_since set.',
          },
        ],
        reasonDistribution: [],
        scoreDistribution: [],
        trustDistribution: [],
        trustSourceDistribution: [],
        checks: [
          {
            id: 'indexability-migration-missing',
            label: 'Indexability migration missing',
            severity: 'critical',
            count: 1,
            description: 'The active D1 database does not have the 0014 skill indexability columns yet.',
            issues: [{
              slug: null,
              owner: null,
              repo: null,
              name: null,
              displayName: null,
              value: 'migrations/0014_skill_indexability.sql',
              detail: 'Apply the indexability migration and recompute script before relying on sitemap/index decisions.',
            }],
          },
        ],
      }
    }

    const [
      totalSkills,
      visibleSkills,
      indexableSkills,
      noindexSkills,
      trustedSkills,
      candidateSkills,
      quarantinedSkills,
      brokenSkills,
      staleSyncs,
      staleIndexability,
      missingDescriptions,
      missingSummaries,
      missingTags,
      missingFaqs,
      reasonDistribution,
      scoreDistribution,
      trustDistribution,
      trustSourceDistribution,
      checks,
    ] = await Promise.all([
      firstCount(db, 'SELECT COUNT(*) AS count FROM skills'),
      firstCount(db, `SELECT COUNT(*) AS count FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo WHERE r.broken_since IS NULL OR r.broken_since > ${brokenVisibleCutoff}`),
      firstCount(db, 'SELECT COUNT(*) AS count FROM skills WHERE seo_indexable = 1'),
      firstCount(db, 'SELECT COUNT(*) AS count FROM skills WHERE seo_indexable = 0'),
      hasTrustColumns
        ? firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE trust_tier IN ('official', 'trusted-author', 'trusted-curator')`)
        : Promise.resolve(0),
      hasTrustColumns
        ? firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE trust_tier = 'candidate'`)
        : Promise.resolve(0),
      hasTrustColumns
        ? firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE trust_tier = 'quarantined'`)
        : Promise.resolve(0),
      firstCount(db, 'SELECT COUNT(*) AS count FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo WHERE r.broken_since IS NOT NULL'),
      firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE last_synced_at IS NULL OR last_synced_at < ${staleBefore}`),
      firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE seo_index_synced_at IS NULL OR seo_index_synced_at < ${staleIndexabilityBefore}`),
      firstCount(db, `SELECT COUNT(*) AS count FROM skills WHERE description IS NULL OR length(trim(description)) < 40`),
      firstCount(db, `SELECT COUNT(*) AS count
      FROM skills s
      LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
      WHERE g.owner IS NULL`),
      firstCount(db, `SELECT COUNT(*) AS count
      FROM skills s
      LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'tags'
      WHERE g.owner IS NULL`),
      firstCount(db, `SELECT COUNT(*) AS count
      FROM skills s
      LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'faq'
      WHERE g.owner IS NULL`),
      distribution(db, `SELECT je.value AS label, COUNT(*) AS count
      FROM skills s, json_each(CASE WHEN json_valid(s.seo_index_reasons) THEN s.seo_index_reasons ELSE '[]' END) je
      GROUP BY je.value
      ORDER BY count DESC, label ASC
      LIMIT 20`),
      distribution(db, `SELECT seo_index_score AS label, COUNT(*) AS count
      FROM skills
      GROUP BY seo_index_score
      ORDER BY seo_index_score DESC
      LIMIT 30`),
      hasTrustColumns
        ? distribution(db, `SELECT trust_tier AS label, COUNT(*) AS count
        FROM skills
        GROUP BY trust_tier
        ORDER BY count DESC, label ASC`)
        : Promise.resolve([]),
      hasTrustColumns
        ? distribution(db, `SELECT trust_source AS label, COUNT(*) AS count
        FROM skills
        GROUP BY trust_source
        ORDER BY count DESC, label ASC`)
        : Promise.resolve([]),
      Promise.all([
        buildCheck(db, {
          id: 'indexability-not-synced',
          label: 'Indexability not fresh',
          severity: 'critical',
          description: 'Rows without a recent seo_index_synced_at may be using stale noindex/index decisions.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE seo_index_synced_at IS NULL OR seo_index_synced_at < ${staleIndexabilityBefore}`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            COALESCE(datetime(seo_index_synced_at, 'unixepoch'), 'never') AS value
          FROM skills
          WHERE seo_index_synced_at IS NULL OR seo_index_synced_at < ${staleIndexabilityBefore}
          ORDER BY COALESCE(seo_index_synced_at, 0) ASC, owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'Indexability scoring has not been synced in the last 24 hours.',
        }),
        buildCheck(db, {
          id: 'indexable-broken',
          label: 'Indexable but broken',
          severity: 'critical',
          description: 'Broken rows should not remain indexable, even during the visibility grace period.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
          WHERE s.seo_indexable = 1 AND r.broken_since IS NOT NULL`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            datetime(r.broken_since, 'unixepoch') AS value
          FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
          WHERE s.seo_indexable = 1 AND r.broken_since IS NOT NULL
          ORDER BY r.broken_since DESC, s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'This skill is marked broken but still has seo_indexable = 1.',
        }),
        buildCheck(db, {
          id: 'indexable-source-missing',
          label: 'Indexable without source',
          severity: 'critical',
          description: 'Indexable skill pages need a resolved SKILL.md source and current SHA.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE seo_indexable = 1 AND (source_resolved = 0 OR current_sha IS NULL OR sync_status IN ('path_missing', 'fetch_failed'))`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            COALESCE(sync_status, 'missing current_sha/source') AS value
          FROM skills
          WHERE seo_indexable = 1 AND (source_resolved = 0 OR current_sha IS NULL OR sync_status IN ('path_missing', 'fetch_failed'))
          ORDER BY owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'This skill is indexable but its source resolution signal is missing or failed.',
        }),
        buildCheck(db, {
          id: 'indexable-thin',
          label: 'Indexable but thin',
          severity: 'warning',
          description: 'Indexable pages with no generated summary or short descriptions are likely weaker crawl targets.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE s.seo_indexable = 1
            AND (s.description IS NULL OR length(trim(s.description)) < 40 OR g.owner IS NULL)`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            CASE
              WHEN s.description IS NULL OR length(trim(s.description)) < 40 THEN 'thin description'
              ELSE 'missing summary'
            END AS value
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE s.seo_indexable = 1
            AND (s.description IS NULL OR length(trim(s.description)) < 40 OR g.owner IS NULL)
          ORDER BY s.seo_index_score ASC, s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'This page is indexable but lacks enough page content support.',
        }),
        buildCheck(db, {
          id: 'route-field-gaps',
          label: 'Route field gaps',
          severity: 'critical',
          description: 'Rows missing owner, repo, name, display name, or slug can produce bad URLs, duplicate metadata, or 404s from sitemap paths.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE owner IS NULL OR trim(owner) = ''
             OR repo IS NULL OR trim(repo) = ''
             OR name IS NULL OR trim(name) = ''
             OR slug IS NULL OR trim(slug) = ''
             OR display_name IS NULL OR trim(display_name) = ''`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            'missing required route/display field' AS value
          FROM skills
          WHERE owner IS NULL OR trim(owner) = ''
             OR repo IS NULL OR trim(repo) = ''
             OR name IS NULL OR trim(name) = ''
             OR slug IS NULL OR trim(slug) = ''
             OR display_name IS NULL OR trim(display_name) = ''
          ORDER BY owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'Required routing or display data is blank.',
        }),
        buildCheck(db, {
          id: 'slug-mismatch',
          label: 'Slug mismatches',
          severity: 'warning',
          description: 'The detail API still resolves owner/repo/name URLs, but stale slugs can split internal links and event attribution.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE slug != owner || '/' || name`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            owner || '/' || name AS value
          FROM skills
          WHERE slug != owner || '/' || name
          ORDER BY owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'Stored slug differs from the canonical registry slug.',
        }),
        buildCheck(db, {
          id: 'duplicate-page-targets',
          label: 'Duplicate page targets',
          severity: 'critical',
          description: 'Duplicate owner/repo/name targets can cause sitemap collisions and unstable page content.',
          countSql: `SELECT COUNT(*) AS count
          FROM (
            SELECT owner, repo, name
            FROM skills
            GROUP BY owner, repo, name
            HAVING COUNT(*) > 1
          )`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            d.duplicates AS value
          FROM skills s
          JOIN (
            SELECT owner, repo, name, COUNT(*) AS duplicates
            FROM skills
            GROUP BY owner, repo, name
            HAVING COUNT(*) > 1
          ) d ON d.owner = s.owner AND d.repo = s.repo AND d.name = s.name
          ORDER BY d.duplicates DESC, s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Multiple rows map to the same public skill page.',
        }),
        buildCheck(db, {
          id: 'broken-visible',
          label: 'Broken rows still visible',
          severity: 'critical',
          description: 'Broken skills remain visible for a seven-day grace period; these are still eligible for listings and sitemap entries while degraded.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
          WHERE r.broken_since IS NOT NULL AND r.broken_since > ${brokenVisibleCutoff}`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            datetime(r.broken_since, 'unixepoch') AS value
          FROM skills s JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
          WHERE r.broken_since IS NOT NULL AND r.broken_since > ${brokenVisibleCutoff}
          ORDER BY r.broken_since DESC
          LIMIT ?`,
          detail: 'Marked broken, but still inside the listing and sitemap grace window.',
        }),
        buildCheck(db, {
          id: 'stale-sync',
          label: 'Stale or missing sync',
          severity: 'warning',
          description: 'Rows not synced in the last 36 hours may have stale descriptions, repo metadata, generated content, or source status.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE last_synced_at IS NULL OR last_synced_at < ${staleBefore}`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            COALESCE(datetime(last_synced_at, 'unixepoch'), 'never') AS value
          FROM skills
          WHERE last_synced_at IS NULL OR last_synced_at < ${staleBefore}
          ORDER BY COALESCE(last_synced_at, 0) ASC, owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'Sync timestamp is missing or older than 36 hours.',
        }),
        buildCheck(db, {
          id: 'thin-descriptions',
          label: 'Thin descriptions',
          severity: 'warning',
          description: 'Skill pages fall back to terse generated copy when repository/frontmatter descriptions are absent or too short.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills
          WHERE description IS NULL OR length(trim(description)) < 40`,
          issuesSql: `SELECT slug, owner, repo, name, display_name,
            COALESCE(description, '') AS value
          FROM skills
          WHERE description IS NULL OR length(trim(description)) < 40
          ORDER BY owner ASC, repo ASC, name ASC
          LIMIT ?`,
          detail: 'Description is missing or shorter than 40 characters.',
        }),
        buildCheck(db, {
          id: 'missing-summary',
          label: 'Missing summaries',
          severity: 'warning',
          description: 'Summary payloads drive stronger titles and descriptions on skill pages.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE g.owner IS NULL`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            s.current_sha AS value
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE g.owner IS NULL
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'No generated summary row exists for this skill.',
        }),
        buildCheck(db, {
          id: 'stale-summary',
          label: 'Stale summaries',
          severity: 'warning',
          description: 'Summary payloads tied to an old SHA can leave titles and meta descriptions out of step with the current SKILL.md.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            g.sha || ' != ' || s.current_sha AS value
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'summary'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Generated summary SHA does not match current source SHA.',
        }),
        buildCheck(db, {
          id: 'missing-tags',
          label: 'Missing tags',
          severity: 'info',
          description: 'Tags improve browse paths and topical internal linking.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'tags'
          WHERE g.owner IS NULL`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            s.current_sha AS value
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'tags'
          WHERE g.owner IS NULL
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'No generated tag row exists for this skill.',
        }),
        buildCheck(db, {
          id: 'stale-tags',
          label: 'Stale tags',
          severity: 'info',
          description: 'Tag payloads tied to an old SHA may create stale topical links.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'tags'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            g.sha || ' != ' || s.current_sha AS value
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'tags'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Generated tags SHA does not match current source SHA.',
        }),
        buildCheck(db, {
          id: 'missing-faqs',
          label: 'Missing FAQs',
          severity: 'info',
          description: 'FAQ payloads enrich structured data and page depth where they are available.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'faq'
          WHERE g.owner IS NULL`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            s.current_sha AS value
          FROM skills s
          LEFT JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'faq'
          WHERE g.owner IS NULL
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'No generated FAQ row exists for this skill.',
        }),
        buildCheck(db, {
          id: 'stale-faqs',
          label: 'Stale FAQs',
          severity: 'info',
          description: 'FAQ payloads tied to an old SHA may describe outdated behavior.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'faq'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            g.sha || ' != ' || s.current_sha AS value
          FROM skills s
          JOIN skill_generated g ON g.owner = s.owner AND g.repo = s.repo AND g.name = s.name AND g.kind = 'faq'
          WHERE s.current_sha IS NOT NULL AND g.sha != s.current_sha
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Generated FAQ SHA does not match current source SHA.',
        }),
        buildCheck(db, {
          id: 'orphan-generated',
          label: 'Orphan generated content',
          severity: 'warning',
          description: 'Generated rows without a matching skill waste storage and can confuse derived-data backfills.',
          countSql: `SELECT COUNT(*) AS count
          FROM skill_generated g
          LEFT JOIN skills s ON s.owner = g.owner AND s.repo = g.repo AND s.name = g.name
          WHERE s.owner IS NULL`,
          issuesSql: `SELECT NULL AS slug, g.owner, g.repo, g.name, NULL AS display_name,
            g.kind AS value
          FROM skill_generated g
          LEFT JOIN skills s ON s.owner = g.owner AND s.repo = g.repo AND s.name = g.name
          WHERE s.owner IS NULL
          ORDER BY g.generated_at DESC
          LIMIT ?`,
          detail: 'Generated payload has no matching skill row.',
        }),
        buildCheck(db, {
          id: 'orphan-social',
          label: 'Orphan social posts',
          severity: 'warning',
          description: 'Approved social proof that no longer maps to a skill page can create broken supporting data.',
          countSql: `SELECT COUNT(*) AS count
          FROM skill_social_posts p
          LEFT JOIN skills s ON s.slug = p.skill_slug
          WHERE s.slug IS NULL`,
          issuesSql: `SELECT p.skill_slug AS slug, NULL AS owner, NULL AS repo, NULL AS name, NULL AS display_name,
            p.post_url AS value
          FROM skill_social_posts p
          LEFT JOIN skills s ON s.slug = p.skill_slug
          WHERE s.slug IS NULL
          ORDER BY p.fetched_at DESC
          LIMIT ?`,
          detail: 'Social post references a skill slug that is not in the registry.',
        }),
        buildCheck(db, {
          id: 'curator-count-drift',
          label: 'Curator count drift',
          severity: 'warning',
          description: 'Denormalized curator counts should match collection data or indexability scoring can become stale.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          WHERE s.curator_count != (
            SELECT COUNT(*)
            FROM collection_skills_v2 cs
            JOIN collections_v2 c ON c.id = cs.collection_id
            WHERE c.deleted_at IS NULL
              AND cs.name = s.name
              AND cs.owner = s.owner
              AND cs.repo = s.repo
          )
          OR s.curator_reason_count != (
            SELECT COUNT(*)
            FROM collection_skills_v2 cs
            JOIN collections_v2 c ON c.id = cs.collection_id
            WHERE c.deleted_at IS NULL
              AND cs.name = s.name
              AND cs.owner = s.owner
              AND cs.repo = s.repo
              AND length(trim(COALESCE(cs.reason, ''))) >= 20
          )`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            'stored ' || s.curator_count || '/' || s.curator_reason_count
            || ', live ' ||
            (
              SELECT COUNT(*)
              FROM collection_skills_v2 cs
              JOIN collections_v2 c ON c.id = cs.collection_id
              WHERE c.deleted_at IS NULL
                AND cs.name = s.name
                AND cs.owner = s.owner
                AND cs.repo = s.repo
            )
            || '/' ||
            (
              SELECT COUNT(*)
              FROM collection_skills_v2 cs
              JOIN collections_v2 c ON c.id = cs.collection_id
              WHERE c.deleted_at IS NULL
                AND cs.name = s.name
                AND cs.owner = s.owner
                AND cs.repo = s.repo
                AND length(trim(COALESCE(cs.reason, ''))) >= 20
            ) AS value
          FROM skills s
          WHERE s.curator_count != (
            SELECT COUNT(*)
            FROM collection_skills_v2 cs
            JOIN collections_v2 c ON c.id = cs.collection_id
            WHERE c.deleted_at IS NULL
              AND cs.name = s.name
              AND cs.owner = s.owner
              AND cs.repo = s.repo
          )
          OR s.curator_reason_count != (
            SELECT COUNT(*)
            FROM collection_skills_v2 cs
            JOIN collections_v2 c ON c.id = cs.collection_id
            WHERE c.deleted_at IS NULL
              AND cs.name = s.name
              AND cs.owner = s.owner
              AND cs.repo = s.repo
              AND length(trim(COALESCE(cs.reason, ''))) >= 20
          )
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Stored curator counts differ from live collection rows.',
        }),
        buildCheck(db, {
          id: 'like-count-drift',
          label: 'Like count drift',
          severity: 'warning',
          description: 'Denormalized like counts are displayed publicly and back ?sort=likes (ADR-0003), so drift is visible to visitors.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          WHERE s.like_count != (
            SELECT COUNT(*)
            FROM skill_likes l
            WHERE l.owner = s.owner
              AND l.repo = s.repo
              AND l.name = s.name
          )`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            'stored ' || s.like_count || ', live ' ||
            (
              SELECT COUNT(*)
              FROM skill_likes l
              WHERE l.owner = s.owner
                AND l.repo = s.repo
                AND l.name = s.name
            ) AS value
          FROM skills s
          WHERE s.like_count != (
            SELECT COUNT(*)
            FROM skill_likes l
            WHERE l.owner = s.owner
              AND l.repo = s.repo
              AND l.name = s.name
          )
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Stored like counts differ from live skill_likes rows.',
        }),
        buildCheck(db, {
          id: 'social-count-drift',
          label: 'Social count drift',
          severity: 'warning',
          description: 'Denormalized social proof counts should match approved social rows.',
          countSql: `SELECT COUNT(*) AS count
          FROM skills s
          WHERE s.approved_social_count != (
            SELECT COUNT(*) FROM skill_social_posts sp
            WHERE sp.skill_slug = s.slug AND sp.status = 'approved'
          )
          OR s.author_social_count != (
            SELECT COUNT(*) FROM skill_social_posts sp
            WHERE sp.skill_slug = s.slug AND sp.status = 'approved' AND sp.role = 'author'
          )`,
          issuesSql: `SELECT s.slug, s.owner, s.repo, s.name, s.display_name,
            'stored ' || s.approved_social_count || '/' || s.author_social_count
            || ', live ' ||
            (
              SELECT COUNT(*) FROM skill_social_posts sp
              WHERE sp.skill_slug = s.slug AND sp.status = 'approved'
            )
            || '/' ||
            (
              SELECT COUNT(*) FROM skill_social_posts sp
              WHERE sp.skill_slug = s.slug AND sp.status = 'approved' AND sp.role = 'author'
            ) AS value
          FROM skills s
          WHERE s.approved_social_count != (
            SELECT COUNT(*) FROM skill_social_posts sp
            WHERE sp.skill_slug = s.slug AND sp.status = 'approved'
          )
          OR s.author_social_count != (
            SELECT COUNT(*) FROM skill_social_posts sp
            WHERE sp.skill_slug = s.slug AND sp.status = 'approved' AND sp.role = 'author'
          )
          ORDER BY s.owner ASC, s.repo ASC, s.name ASC
          LIMIT ?`,
          detail: 'Stored social counts differ from approved social rows.',
        }),
        buildCheck(db, {
          id: 'noindex-review-candidates',
          label: 'Noindex review candidates',
          severity: 'info',
          description: 'Noindexed skills with strong trust signals are worth reviewing before they stay out of the sitemap.',
          countSql: hasTrustColumns
            ? `SELECT COUNT(*) AS count
            FROM skills
            WHERE seo_indexable = 0
              AND trust_tier IN ('official', 'trusted-author', 'trusted-curator', 'candidate')`
            : `SELECT COUNT(*) AS count
            FROM skills
            WHERE seo_indexable = 0
              AND (
                is_official = 1
                OR EXISTS (
                  SELECT 1 FROM repos r
                  WHERE r.owner = skills.owner AND r.repo = skills.repo AND r.stars >= 100
                )
                OR curator_reason_count > 0
                OR author_social_count > 0
              )`,
          issuesSql: hasTrustColumns
            ? `SELECT slug, owner, repo, name, display_name,
              trust_tier || '/' || trust_source || ' score ' || trust_score AS value
            FROM skills
            WHERE seo_indexable = 0
              AND trust_tier IN ('official', 'trusted-author', 'trusted-curator', 'candidate')
            ORDER BY trust_score DESC, owner ASC, repo ASC, name ASC
            LIMIT ?`
            : `SELECT slug, owner, repo, name, display_name,
              'score ' || seo_index_score || ': ' || seo_index_reasons AS value
            FROM skills
            WHERE seo_indexable = 0
              AND (
                is_official = 1
                OR EXISTS (
                  SELECT 1 FROM repos r
                  WHERE r.owner = skills.owner AND r.repo = skills.repo AND r.stars >= 100
                )
                OR curator_reason_count > 0
                OR author_social_count > 0
              )
            ORDER BY seo_index_score DESC, owner ASC, repo ASC, name ASC
            LIMIT ?`,
          detail: 'This skill has a primary trust signal but is currently noindexed.',
        }),
      ]),
    ])

    // sync_jobs observability: any registered job whose last_run_at is older
    // than 2x its cron cadence is "stalled", and any with last_status='error'
    // is surfaced. The table is created in migration 0054; guard against the
    // pre-migration case so the integrity endpoint still works.
    const jobChecks: IntegrityCheck[] = []
    const jobRows = await db
      .prepare(`SELECT name, cron, enabled, stale_after_seconds, last_run_at, last_status, last_error, last_duration_ms, run_count FROM sync_jobs`)
      .all<SyncJobRow>()
      .catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'admin-integrity-sync-jobs', outcome: 'failed' }))
        return null
      })

    if (jobRows?.results?.length) {
      const stalled: SyncJobRow[] = []
      const errored: SyncJobRow[] = []
      for (const job of jobRows.results) {
        if (!job.enabled)
          continue
        const budget = job.stale_after_seconds ?? cronIntervalSeconds(job.cron) * 2
        const age = job.last_run_at != null ? now - job.last_run_at : null
        if (age == null || age > budget)
          stalled.push(job)
        if (job.last_status === 'error')
          errored.push(job)
      }
      if (stalled.length) {
        jobChecks.push({
          id: 'job-stalled',
          label: 'Scheduled jobs stalled',
          severity: 'critical',
          count: stalled.length,
          description: 'Sync jobs that have not reported a run inside 2x their cron cadence (or their configured stale budget).',
          issues: stalled.map(job => ({
            slug: null,
            owner: null,
            repo: null,
            name: job.name,
            displayName: job.name,
            value: job.last_run_at
              ? new Date(job.last_run_at * 1000).toISOString()
              : 'never',
            detail: `Cron ${job.cron}; last status ${job.last_status ?? 'never'}.`,
          })),
        })
      }
      if (errored.length) {
        jobChecks.push({
          id: 'job-errored',
          label: 'Scheduled jobs errored',
          severity: 'critical',
          count: errored.length,
          description: 'Sync jobs whose most recent run finished with status=error.',
          issues: errored.map(job => ({
            slug: null,
            owner: null,
            repo: null,
            name: job.name,
            displayName: job.name,
            value: job.last_error ?? 'unknown error',
            detail: `Cron ${job.cron}; failed at ${job.last_run_at ? new Date(job.last_run_at * 1000).toISOString() : 'unknown'}.`,
          })),
        })
      }
    }

    // AI batch spend visibility: rolling 30-day cost + recently regenerated
    // skills. Table is created in migration 0058; guard against the
    // pre-migration case so the endpoint still works.
    const thirtyDaysAgo = now - 30 * 86400
    const spendRow = await db
      .prepare(
        `SELECT
           COALESCE(SUM(est_cost_usd), 0) AS total_usd,
           COUNT(*) AS batch_count,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens
         FROM ai_batch_costs
         WHERE submitted_at >= ?`,
      )
      .bind(thirtyDaysAgo)
      .first<AiSpendRow>()
      .catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'admin-integrity-ai-spend', outcome: 'failed' }))
        return null
      })

    const recentRegenRows = await db
      .prepare(
        `SELECT owner, repo, name, MAX(generated_at) AS generated_at
         FROM skill_generated
         WHERE kind = 'summary'
         GROUP BY owner, repo, name
         ORDER BY generated_at DESC
         LIMIT 5`,
      )
      .all<RecentRegenRow>()
      .catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'admin-integrity-regeneration', outcome: 'failed' }))
        return null
      })

    const aiSpend: AiSpendSummary | null = spendRow
      ? {
          windowDays: 30,
          totalUsd: spendRow.total_usd ?? 0,
          batchCount: spendRow.batch_count ?? 0,
          inputTokens: spendRow.input_tokens ?? 0,
          outputTokens: spendRow.output_tokens ?? 0,
          recentRegenerations: (recentRegenRows?.results ?? []).map(r => ({
            owner: r.owner,
            repo: r.repo,
            name: r.name,
            generatedAt: r.generated_at,
          })),
        }
      : null

    const allChecks = [...jobChecks, ...checks]

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          label: 'Total skills',
          value: totalSkills,
          tone: 'ok',
          help: 'All registry rows, including broken rows.',
        },
        {
          label: 'Visible skills',
          value: visibleSkills,
          tone: 'ok',
          help: 'Rows eligible for listings and the skills sitemap.',
        },
        {
          label: 'Indexable skills',
          value: indexableSkills,
          tone: 'ok',
          help: 'Rows included in the skills sitemap.',
        },
        {
          label: 'Noindex skills',
          value: noindexSkills,
          tone: noindexSkills ? 'info' : 'ok',
          help: 'Rows intentionally excluded from search indexing.',
        },
        {
          label: 'Index coverage %',
          value: totalSkills ? Math.round((indexableSkills / totalSkills) * 100) : 0,
          tone: 'ok',
          help: 'Percentage of registry rows allowed into the sitemap.',
        },
        {
          label: 'Trusted skills',
          value: trustedSkills,
          tone: 'ok',
          help: 'Official, trusted-author, or trusted-curator rows.',
        },
        {
          label: 'Candidates',
          value: candidateSkills,
          tone: candidateSkills ? 'info' : 'ok',
          help: 'Review queue rows with trust signals but not sitemap eligibility.',
        },
        {
          label: 'Quarantined',
          value: quarantinedSkills,
          tone: quarantinedSkills ? 'critical' : 'ok',
          help: 'Rows explicitly excluded from trust and indexing.',
        },
        {
          label: 'Broken skills',
          value: brokenSkills,
          tone: brokenSkills ? 'critical' : 'ok',
          help: 'Rows with broken_since set.',
        },
        {
          label: 'Stale syncs',
          value: staleSyncs,
          tone: staleSyncs ? 'warning' : 'ok',
          help: 'Rows older than the sync freshness target.',
        },
        {
          label: 'Stale scoring',
          value: staleIndexability,
          tone: staleIndexability ? 'critical' : 'ok',
          help: 'Rows without fresh indexability scoring.',
        },
        {
          label: 'Thin descriptions',
          value: missingDescriptions,
          tone: missingDescriptions ? 'warning' : 'ok',
          help: 'Rows missing usable page description text.',
        },
        {
          label: 'Missing summaries',
          value: missingSummaries,
          tone: missingSummaries ? 'warning' : 'ok',
          help: 'Skills without generated summary payloads.',
        },
        {
          label: 'Missing tags',
          value: missingTags,
          tone: missingTags ? 'info' : 'ok',
          help: 'Skills without generated topical tags.',
        },
        {
          label: 'Missing FAQs',
          value: missingFaqs,
          tone: missingFaqs ? 'info' : 'ok',
          help: 'Skills without FAQ structured data payloads.',
        },
      ],
      reasonDistribution,
      scoreDistribution,
      trustDistribution,
      trustSourceDistribution,
      aiSpend,
      checks: allChecks,
    }
  },
})
