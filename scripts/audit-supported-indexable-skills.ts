/**
 * Audit the restricted supported/indexable sitemap candidate set.
 *
 * Usage:
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --local
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --json
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --missing-generated summary --slugs-only
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --missing-source-facts --slugs-only
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --critical-source-facts --slugs-only
 *   pnpm tsx scripts/audit-supported-indexable-skills.ts --duplicate-duplicates --slugs-only
 *   pnpm seo:audit-supported -- --json
 */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import {
  duplicateRankingSignals,
  findDuplicateCanonicalGroups,
  skillSlug,
} from '../server/utils/skill-duplicate-canonical'
import { SUPPORTED_SKILL_SQL } from '../server/utils/supported-sources'

const ACCOUNT_ID = '5904138d55ca25d5670dca6adf99894e'
const ONE_DAY_SECONDS = 86400
const STALE_REPO_SECONDS = 365 * ONE_DAY_SECONDS
const LOW_DESCRIPTION_CHARS = 80
const BROKEN_GRACE_SECONDS = 7 * ONE_DAY_SECONDS
const NOT_BROKEN_SQL = `(skills.broken_since IS NULL OR skills.broken_since > unixepoch() - ${BROKEN_GRACE_SECONDS})`

const cliArgs = process.argv.slice(2).filter(arg => arg !== '--')

const { values } = parseArgs({
  args: cliArgs,
  options: {
    'json': { type: 'boolean' },
    'local': { type: 'boolean' },
    'limit': { type: 'string', default: '20' },
    'missing-generated': { type: 'string' },
    'missing-source-facts': { type: 'boolean' },
    'critical-source-facts': { type: 'boolean' },
    'duplicate-duplicates': { type: 'boolean' },
    'slugs-only': { type: 'boolean' },
  },
})

if (values['missing-generated'] && !['summary', 'tags', 'faq'].includes(values['missing-generated'])) {
  console.error('Usage: --missing-generated <summary|tags|faq> [--slugs-only]')
  process.exit(1)
}

interface AuditRow {
  owner: string
  repo: string
  name: string
  display_name: string
  description: string | null
  installs: number
  stars: number
  pushed_at: number | null
  default_branch: string | null
  current_sha: string | null
  sync_status: string | null
  references_count: number | null
  repo_skill_count: number | null
  support_tier: string | null
  trust_tier: string | null
  seo_index_score: number | null
  curator_reason_count: number | null
  approved_social_count: number | null
  summary_sha: string | null
  tags_sha: string | null
  faq_sha: string | null
}

interface RepoIssue {
  owner: string
  repo: string
  count: number
  reason: string
  maxInstalls: number
}

interface DuplicateRecommendation {
  reason: string
  value: string
  count: number
  canonical: string
  duplicateSlugs: string[]
  rows: Array<{
    slug: string
    supportTier: string | null
    supportTierRank: number
    trustTier: string | null
    trustTierRank: number
    installs: number
    stars: number
    pushedAt: number | null
    pushedAgeDays: number | null
  }>
}

function d1<T>(sql: string): T[] {
  const flag = values.local ? '--local' : '--remote'
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'skilld-db', flag, '--json', '--command', sql], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
  })
  if (res.status !== 0) {
    console.error(res.stderr)
    throw new Error(`wrangler d1 ${flag} exec failed (${res.status})`)
  }
  const parsed = JSON.parse(res.stdout) as Array<{ results?: T[] }>
  return parsed[0]?.results ?? []
}

function slug(row: Pick<AuditRow, 'owner' | 'repo' | 'name'>): string {
  return skillSlug(row)
}

function ageDays(ts: number | null): number | null {
  if (!ts)
    return null
  return Math.floor((Math.floor(Date.now() / 1000) - ts) / ONE_DAY_SECONDS)
}

function top<T>(items: T[], n: number): T[] {
  return items.slice(0, n)
}

function sourceFactIssues(row: AuditRow, opts: { includeWeakSignals?: boolean } = {}): string[] {
  const staleSync = row.sync_status !== null && row.sync_status !== 'ok'
  return [
    !row.description?.trim() && 'missing_description',
    !row.current_sha && 'missing_current_sha',
    staleSync && `sync_${row.sync_status}`,
    !row.pushed_at && 'missing_repo_recency',
    opts.includeWeakSignals && (row.references_count ?? 0) === 0 && 'no_references',
  ].filter((issue): issue is string => Boolean(issue))
}

function duplicateRecommendations(rows: AuditRow[]): DuplicateRecommendation[] {
  const groups = findDuplicateCanonicalGroups(rows)
  return groups.map((group) => {
    return {
      reason: group.reason,
      value: group.value,
      count: group.rows.length,
      canonical: slug(group.canonical),
      duplicateSlugs: group.duplicates.map(slug),
      rows: group.rows.map((row) => {
        const signals = duplicateRankingSignals(row)
        return {
          slug: slug(row),
          supportTier: signals.supportTier,
          supportTierRank: signals.supportTierRank,
          trustTier: signals.trustTier,
          trustTierRank: signals.trustTierRank,
          installs: signals.installs,
          stars: signals.stars,
          pushedAt: signals.pushedAt,
          pushedAgeDays: ageDays(row.pushed_at),
        }
      }),
    }
  }).sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical))
}

function repoHotspots(rows: AuditRow[], reason: string): RepoIssue[] {
  const byRepo = new Map<string, RepoIssue>()
  for (const row of rows) {
    const key = `${row.owner}/${row.repo}`
    const issue = byRepo.get(key) ?? { owner: row.owner, repo: row.repo, count: 0, reason, maxInstalls: 0 }
    issue.count++
    issue.maxInstalls = Math.max(issue.maxInstalls, row.installs)
    byRepo.set(key, issue)
  }
  return [...byRepo.values()].sort((a, b) => b.count - a.count || b.maxInstalls - a.maxInstalls)
}

const rows = d1<AuditRow>(`
  SELECT
    skills.owner,
    skills.repo,
    skills.name,
    skills.display_name,
    skills.description,
    skills.installs,
    skills.stars,
    skills.pushed_at,
    skills.default_branch,
    skills.current_sha,
    skills.sync_status,
    skills.references_count,
    skills.repo_skill_count,
    sr.support_tier,
    skills.trust_tier,
    skills.seo_index_score,
    skills.curator_reason_count,
    skills.approved_social_count,
    summary.sha AS summary_sha,
    tags.sha AS tags_sha,
    faq.sha AS faq_sha
  FROM skills
  LEFT JOIN skill_generated summary ON summary.owner = skills.owner AND summary.repo = skills.repo AND summary.name = skills.name AND summary.kind = 'summary'
  LEFT JOIN skill_generated tags ON tags.owner = skills.owner AND tags.repo = skills.repo AND tags.name = skills.name AND tags.kind = 'tags'
  LEFT JOIN skill_generated faq ON faq.owner = skills.owner AND faq.repo = skills.repo AND faq.name = skills.name AND faq.kind = 'faq'
  LEFT JOIN supported_repos sr ON sr.owner = skills.owner AND sr.repo = skills.repo AND sr.enabled = 1
  WHERE ${NOT_BROKEN_SQL}
    AND skills.seo_indexable = 1
    AND (${SUPPORTED_SKILL_SQL})
  ORDER BY skills.installs DESC, skills.stars DESC, skills.owner ASC, skills.name ASC
`)

const now = Math.floor(Date.now() / 1000)
const sampleLimit = Math.max(1, Number.parseInt(values.limit ?? '20', 10) || 20)
const missingDescriptions = rows.filter(r => !r.description?.trim())
const shortDescriptions = rows.filter((r) => {
  const desc = r.description?.trim()
  return Boolean(desc && desc.length < LOW_DESCRIPTION_CHARS)
})
const duplicateCanonicalRecommendations = duplicateRecommendations(rows)
const duplicateTitleRecommendations = duplicateCanonicalRecommendations.filter(r => r.reason === 'duplicate_title')
const duplicateDescriptionRecommendations = duplicateCanonicalRecommendations.filter(r => r.reason === 'duplicate_description')
const duplicateTitleGroups = duplicateTitleRecommendations.map(g => ({ value: g.value, rows: g.rows.map(r => r.slug) }))
const duplicateDescriptionGroups = duplicateDescriptionRecommendations.map(g => ({ value: g.value, rows: g.rows.map(r => r.slug) }))
const weakerDuplicateSlugs = duplicateCanonicalRecommendations.flatMap(r => r.duplicateSlugs)
const lowContentDepth = rows.filter((r) => {
  const descLength = r.description?.trim().length ?? 0
  const generatedCount = [r.summary_sha, r.tags_sha, r.faq_sha].filter(Boolean).length
  return descLength < LOW_DESCRIPTION_CHARS
    || (r.references_count ?? 0) === 0
    || generatedCount === 0
})
const staleRepos = rows.filter(r => !r.pushed_at || r.pushed_at < now - STALE_REPO_SECONDS)
const brokenOrEmptyMetadata = rows.filter(r =>
  !r.current_sha
  || !r.default_branch
  || !r.pushed_at
  || (r.sync_status !== null && r.sync_status !== 'ok'),
)
const missingGeneratedSummary = rows.filter(r => !r.summary_sha)
const missingGeneratedTags = rows.filter(r => !r.tags_sha)
const missingGeneratedFaq = rows.filter(r => !r.faq_sha)
const missingGeneratedRows = values['missing-generated'] === 'summary'
  ? missingGeneratedSummary
  : values['missing-generated'] === 'tags'
    ? missingGeneratedTags
    : values['missing-generated'] === 'faq'
      ? missingGeneratedFaq
      : []
const missingCriticalSourceFacts = rows.filter(r => sourceFactIssues(r).length > 0)
const missingSourceFacts = rows
  .filter(r => sourceFactIssues(r, { includeWeakSignals: true }).length > 0)
  .sort((a, b) =>
    sourceFactIssues(b).length - sourceFactIssues(a).length
    || sourceFactIssues(b, { includeWeakSignals: true }).length - sourceFactIssues(a, { includeWeakSignals: true }).length
    || b.installs - a.installs,
  )

if (values['missing-generated']) {
  const limited = top(missingGeneratedRows, sampleLimit)
  if (values['slugs-only']) {
    for (const row of limited)
      console.log(slug(row))
  }
  else {
    console.log(JSON.stringify(limited.map(row => ({
      slug: slug(row),
      installs: row.installs,
      stars: row.stars,
      trustTier: row.trust_tier,
      seoIndexScore: row.seo_index_score,
    })), null, 2))
  }
  process.exit(0)
}

if (values['duplicate-duplicates']) {
  const limited = top(weakerDuplicateSlugs, sampleLimit)
  if (values['slugs-only']) {
    for (const duplicateSlug of limited)
      console.log(duplicateSlug)
  }
  else {
    for (const rec of top(duplicateCanonicalRecommendations, sampleLimit)) {
      for (const duplicateSlug of rec.duplicateSlugs)
        console.log(`${duplicateSlug},${rec.canonical},${rec.reason}`)
    }
  }
  process.exit(0)
}

if (values['missing-source-facts'] || values['critical-source-facts']) {
  const sourceRows = values['critical-source-facts'] ? missingCriticalSourceFacts : missingSourceFacts
  const limited = top(sourceRows, sampleLimit)
  if (values['slugs-only']) {
    for (const row of limited)
      console.log(slug(row))
  }
  else {
    console.log(JSON.stringify(limited.map(row => ({
      slug: slug(row),
      issues: sourceFactIssues(row, { includeWeakSignals: !values['critical-source-facts'] }),
      supportTier: row.support_tier,
      trustTier: row.trust_tier,
      installs: row.installs,
      stars: row.stars,
      pushedAgeDays: ageDays(row.pushed_at),
      referencesCount: row.references_count ?? 0,
      syncStatus: row.sync_status,
      hasSha: Boolean(row.current_sha),
    })), null, 2))
  }
  process.exit(0)
}

const report = {
  target: values.local ? 'local' : 'remote',
  total: rows.length,
  counts: {
    missingDescriptions: missingDescriptions.length,
    shortDescriptions: shortDescriptions.length,
    duplicateTitleGroups: duplicateTitleRecommendations.length,
    duplicateDescriptionGroups: duplicateDescriptionRecommendations.length,
    weakerDuplicateSkills: weakerDuplicateSlugs.length,
    lowContentDepth: lowContentDepth.length,
    staleRepos: staleRepos.length,
    brokenOrEmptyMetadata: brokenOrEmptyMetadata.length,
    missingGeneratedSummary: missingGeneratedSummary.length,
    missingGeneratedTags: missingGeneratedTags.length,
    missingGeneratedFaq: missingGeneratedFaq.length,
    missingCriticalSourceFacts: missingCriticalSourceFacts.length,
    missingSourceFacts: missingSourceFacts.length,
  },
  samples: {
    missingDescriptions: top(missingDescriptions, sampleLimit).map(slug),
    shortDescriptions: top(shortDescriptions, sampleLimit).map(r => ({ slug: slug(r), chars: r.description?.trim().length ?? 0 })),
    lowContentDepth: top(lowContentDepth, sampleLimit).map(r => ({
      slug: slug(r),
      descriptionChars: r.description?.trim().length ?? 0,
      referencesCount: r.references_count ?? 0,
      generatedKinds: [r.summary_sha && 'summary', r.tags_sha && 'tags', r.faq_sha && 'faq'].filter(Boolean),
    })),
    staleRepos: top(staleRepos, sampleLimit).map(r => ({ slug: slug(r), pushedAgeDays: ageDays(r.pushed_at) })),
    brokenOrEmptyMetadata: top(brokenOrEmptyMetadata, sampleLimit).map(r => ({
      slug: slug(r),
      syncStatus: r.sync_status,
      hasSha: Boolean(r.current_sha),
      defaultBranch: r.default_branch,
      pushedAt: r.pushed_at,
    })),
    duplicateTitles: top(duplicateTitleGroups, sampleLimit).map(g => ({ title: g.value, count: g.rows.length, slugs: top(g.rows, 8) })),
    duplicateDescriptions: top(duplicateDescriptionGroups, sampleLimit).map(g => ({ count: g.rows.length, sample: g.value.slice(0, 120), slugs: top(g.rows, 8) })),
    duplicateTitleRecommendations: top(duplicateTitleRecommendations, sampleLimit),
    duplicateDescriptionRecommendations: top(duplicateDescriptionRecommendations, sampleLimit),
    duplicateCanonicalRecommendations: top(duplicateCanonicalRecommendations, sampleLimit),
    missingCriticalSourceFacts: top(missingCriticalSourceFacts, sampleLimit).map(r => ({
      slug: slug(r),
      issues: sourceFactIssues(r),
    })),
    missingSourceFacts: top(missingSourceFacts, sampleLimit).map(r => ({
      slug: slug(r),
      issues: sourceFactIssues(r, { includeWeakSignals: true }),
    })),
    staleRepoHotspots: top(repoHotspots(staleRepos, 'stale_repo'), sampleLimit),
    metadataHotspots: top(repoHotspots(brokenOrEmptyMetadata, 'broken_or_empty_metadata'), sampleLimit),
  },
}

if (values.json) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

function printList(items: unknown[]): void {
  if (!items.length) {
    console.log('- none')
    return
  }
  for (const item of items)
    console.log(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`)
}

console.log(`# Supported Indexable Skills Audit (${report.target})`)
console.log('')
console.log(`Total supported-indexable skills: ${report.total}`)
console.log('')
console.log('## Counts')
for (const [key, value] of Object.entries(report.counts))
  console.log(`- ${key}: ${value}`)
console.log('')
console.log('## Top Low Content Depth')
printList(report.samples.lowContentDepth)
console.log('')
console.log('## Top Stale Repos')
printList(report.samples.staleRepos)
console.log('')
console.log('## Top Broken/Empty Metadata')
printList(report.samples.brokenOrEmptyMetadata)
console.log('')
console.log('## Duplicate Title Groups')
printList(report.samples.duplicateTitles)
console.log('')
console.log('## Duplicate Description Groups')
printList(report.samples.duplicateDescriptions)
console.log('')
console.log('## Duplicate Canonical Recommendations')
printList(report.samples.duplicateCanonicalRecommendations)
console.log('')
console.log('## Missing Source Facts')
printList(report.samples.missingSourceFacts)
console.log('')
console.log('## Missing Critical Source Facts')
printList(report.samples.missingCriticalSourceFacts)
console.log('')
console.log('## Repo Hotspots')
printList([...report.samples.metadataHotspots, ...report.samples.staleRepoHotspots].slice(0, sampleLimit))
