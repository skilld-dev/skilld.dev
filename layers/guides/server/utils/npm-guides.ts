import type { H3Event } from 'h3'
import { getDB, retryIdempotentD1Write } from '#shared/server/db'

/** Per-type change counts (change8-style badges). */
export interface BucketCounts {
  breaking: number
  features: number
  fixes: number
  improvements: number
}

const ZERO_COUNTS: BucketCounts = { breaking: 0, features: 0, fixes: 0, improvements: 0 }

/**
 * A single change within a version bucket. A bare string is the legacy shape
 * (text only); the object shape lets the generator attribute the change to the
 * commit and/or PR that introduced it, so the page can link to source.
 */
export type BucketItem = string | { text: string, commit?: string, pr?: number }

/** Buckets for one version — powers the from-version window + per-version sections. */
export interface VersionBuckets {
  version: string
  buckets: { breaking: BucketItem[], features: BucketItem[], fixes: BucketItem[], improvements: BucketItem[] }
  counts: BucketCounts
}

/** A migration guide row as stored in D1 / returned to the page. */
export interface NpmGuide {
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
  counts: BucketCounts
  /** Per-version buckets, newest-first (empty for guides ingested before 0062). */
  releaseBuckets: VersionBuckets[]
  supersedes: string[]
  model?: string
  generatedAt: string
}

/** Shape persisted by the local generator (`skilld` GeneratedGuide). */
export interface IngestGuide {
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
  counts?: BucketCounts
  releaseBuckets?: VersionBuckets[]
  supersedes?: string[]
  model?: string
}

interface GuideRow {
  slug: string
  package_name: string
  version: string
  tag: string
  prerelease: number
  from_version: string | null
  repo_url: string | null
  released_at: string | null
  title: string
  markdown: string
  supersedes: string | null
  release_buckets: string | null
  model: string | null
  generated_at: string
  count_breaking: number
  count_features: number
  count_fixes: number
  count_improvements: number
}

function rowCounts(row: { count_breaking: number, count_features: number, count_fixes: number, count_improvements: number }): BucketCounts {
  return {
    breaking: row.count_breaking ?? 0,
    features: row.count_features ?? 0,
    fixes: row.count_fixes ?? 0,
    improvements: row.count_improvements ?? 0,
  }
}

function rowToGuide(row: GuideRow): NpmGuide {
  return {
    slug: row.slug,
    packageName: row.package_name,
    version: row.version,
    tag: row.tag,
    prerelease: !!row.prerelease,
    fromVersion: row.from_version ?? undefined,
    repoUrl: row.repo_url ?? undefined,
    releasedAt: row.released_at ?? undefined,
    title: row.title,
    markdown: row.markdown,
    counts: rowCounts(row),
    releaseBuckets: row.release_buckets ? JSON.parse(row.release_buckets) : [],
    supersedes: row.supersedes ? JSON.parse(row.supersedes) : [],
    model: row.model ?? undefined,
    generatedAt: row.generated_at,
  }
}

export async function findGuide(event: H3Event, slug: string): Promise<NpmGuide | null> {
  const row = await getDB(event)
    .prepare('SELECT * FROM npm_guides WHERE slug = ?')
    .bind(slug)
    .first<GuideRow>()
  return row ? rowToGuide(row) : null
}

export interface GuideSummary {
  slug: string
  packageName: string
  version: string
  prerelease: boolean
  title: string
  counts: BucketCounts
}

export async function listGuides(event: H3Event): Promise<GuideSummary[]> {
  const { results } = await getDB(event)
    .prepare('SELECT slug, package_name, version, prerelease, title, count_breaking, count_features, count_fixes, count_improvements FROM npm_guides ORDER BY package_name')
    .all<{ slug: string, package_name: string, version: string, prerelease: number, title: string, count_breaking: number, count_features: number, count_fixes: number, count_improvements: number }>()
  return (results ?? []).map(r => ({
    slug: r.slug,
    packageName: r.package_name,
    version: r.version,
    prerelease: !!r.prerelease,
    title: r.title,
    counts: rowCounts(r),
  }))
}

export async function listGuidesForSitemap(event: H3Event): Promise<{ slug: string, generatedAt: string }[]> {
  const { results } = await getDB(event)
    .prepare('SELECT slug, generated_at FROM npm_guides ORDER BY package_name')
    .all<{ slug: string, generated_at: string }>()
  return (results ?? []).map(r => ({ slug: r.slug, generatedAt: r.generated_at }))
}

/** Upsert a generated guide. `generatedAt` is supplied by the ingester. */
export function upsertGuide(db: D1Database, guide: IngestGuide, generatedAt: string): Promise<unknown> {
  return retryIdempotentD1Write(() => db
    .prepare(`INSERT INTO npm_guides
      (slug, package_name, version, tag, prerelease, from_version, repo_url, released_at, title, markdown, supersedes, release_buckets, model, generated_at, count_breaking, count_features, count_fixes, count_improvements)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        package_name = excluded.package_name,
        version = excluded.version,
        tag = excluded.tag,
        prerelease = excluded.prerelease,
        from_version = excluded.from_version,
        repo_url = excluded.repo_url,
        released_at = excluded.released_at,
        title = excluded.title,
        markdown = excluded.markdown,
        supersedes = excluded.supersedes,
        release_buckets = excluded.release_buckets,
        model = excluded.model,
        generated_at = excluded.generated_at,
        count_breaking = excluded.count_breaking,
        count_features = excluded.count_features,
        count_fixes = excluded.count_fixes,
        count_improvements = excluded.count_improvements`)
    .bind(
      guide.slug,
      guide.packageName,
      guide.version,
      guide.tag,
      guide.prerelease ? 1 : 0,
      guide.fromVersion ?? null,
      guide.repoUrl ?? null,
      guide.releasedAt ?? null,
      guide.title,
      guide.markdown,
      JSON.stringify(guide.supersedes ?? []),
      JSON.stringify(guide.releaseBuckets ?? []),
      guide.model ?? null,
      generatedAt,
      (guide.counts ?? ZERO_COUNTS).breaking,
      (guide.counts ?? ZERO_COUNTS).features,
      (guide.counts ?? ZERO_COUNTS).fixes,
      (guide.counts ?? ZERO_COUNTS).improvements,
    )
    .run())
}
