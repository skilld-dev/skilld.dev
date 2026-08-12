import { resolveCloudflareBindings } from '@harlan-zw/nuxt-cloudflare/bindings'
import { runObservedScheduledTask } from '~~/server/utils/scheduled-run'
/// <reference types="@cloudflare/workers-types" />
import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import { observedSchedulePolicy } from '#shared/schedule-policy'
import { pAll } from '#shared/server/p-all'

const CRON = '30 * * * *'

/**
 * Scheduled task: ingest social proof for tracked skills from Hacker News
 * via the free Algolia search_by_date endpoint.
 *
 * One site-wide query catches mentions of skilld.dev; per-repo queries catch
 * `github.com/<owner>/<repo>` mentions. Hits land in `skill_social_posts`
 * with dedup via `(skill_slug, platform, post_url)`. Posts >= HN_AUTO_APPROVE
 * points auto-approve so trust scoring picks them up next cycle; the rest
 * stay 'pending' for manual review.
 *
 * Every skill that gains a new approved post is enqueued into `skill_dirty`
 * so curator/social counter recompute + indexability + trust recompute run
 * on the next drain.
 */

const TOP_N_REPOS = 50
const HN_AUTO_APPROVE = 5
const HN_CONCURRENCY = 4
// HN posts older than this are not re-fetched. Cron runs every 30min so a
// 3-day cutoff gives ample slack if a run is missed; older mentions only
// matter on initial backfill which a one-shot job can handle separately.
const HN_LOOKBACK_SECONDS = 3 * 24 * 3600

interface SkillRow {
  owner: string
  repo: string
  name: string
  slug: string
  trust_score: number
}

interface HnHit {
  objectID: string
  title: string | null
  url: string | null
  story_text: string | null
  author: string
  created_at_i: number
  points: number | null
}

interface HnResponse {
  hits: HnHit[]
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function parseGithubRepoFromUrl(url: string | null): { owner: string, repo: string } | null {
  if (!url)
    return null
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i)
  if (!m)
    return null
  return { owner: m[1]!.toLowerCase(), repo: m[2]!.toLowerCase().replace(/\.git$/, '') }
}

function parseSkilldSlugFromUrl(url: string | null): string | null {
  if (!url)
    return null
  const m = url.match(/skilld\.dev\/skills\/([^/\s#?]+\/[^/\s#?]+(?:\/[^/\s#?]+)?)/i)
  return m ? m[1]! : null
}

async function hnSearch(query: string): Promise<HnHit[]> {
  const cutoff = nowSec() - HN_LOOKBACK_SECONDS
  const filter = encodeURIComponent(`created_at_i>${cutoff}`)
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=50&numericFilters=${filter}`
  const res = await fetch(url, { headers: { 'User-Agent': 'skilld.dev' } })
  if (!res.ok) {
    console.warn(`[sync-social-mentions] HN search failed for "${query}": ${res.status}`)
    return []
  }
  const body = await res.json() as HnResponse
  return body.hits ?? []
}

interface PendingInsert {
  skillSlug: string
  postUrl: string
  postId: string
  authorHandle: string
  textExtract: string
  title: string | null
  score: number | null
  postedAt: number
  status: 'pending' | 'approved'
  role: 'author' | 'community'
}

async function insertPosts(db: D1Database, posts: PendingInsert[]): Promise<{ inserted: number, dirtySkills: Set<string> }> {
  const dirtySkills = new Set<string>()
  if (posts.length === 0)
    return { inserted: 0, dirtySkills }

  const fetchedAt = nowSec()
  let inserted = 0
  for (const p of posts) {
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO skill_social_posts (
           skill_slug, platform, post_url, post_id, author_handle, author_avatar,
           role, status, text_extract, title, score, posted_at, fetched_at
         ) VALUES (?1, 'hn', ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
        p.skillSlug,
        p.postUrl,
        p.postId,
        p.authorHandle,
        p.role,
        p.status,
        p.textExtract,
        p.title,
        p.score,
        p.postedAt,
        fetchedAt,
      )
      .run()
    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
    if (changes > 0) {
      inserted += 1
      if (p.status === 'approved')
        dirtySkills.add(p.skillSlug)
    }
  }
  return { inserted, dirtySkills }
}

async function enqueueDirty(db: D1Database, skills: SkillRow[]): Promise<number> {
  if (skills.length === 0)
    return 0
  const queuedAt = nowSec()
  let enqueued = 0
  for (const s of skills) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
         VALUES (?1, ?2, ?3, 'social', ?4, 0)`,
      )
      .bind(s.owner, s.repo, s.name, queuedAt)
      .run()
    enqueued += 1
  }
  return enqueued
}

export default defineScheduledTask({
  name: 'sync-social-mentions',
  cron: '30 * * * *',
  description: 'Ingest HN mentions of skilld.dev + tracked repos into skill_social_posts',
  async run({ context }) {
    const env = resolveCloudflareBindings<Cloudflare.Env>(context)
    const db = env?.DB as D1Database | undefined
    if (!env || !db) {
      console.warn('[sync-social-mentions] D1 binding not available')
      return { result: { error: 'no-db' } }
    }

    return await runObservedScheduledTask({
      db,
      env,
      context,
      policy: observedSchedulePolicy('sync-social-mentions'),
    }, async () => {
      const startedAt = Date.now()

      const topSkillsRes = await db
        .prepare(
          `SELECT s.owner, s.repo, s.name, s.slug, s.trust_score
         FROM skills s
         LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         ORDER BY s.trust_score DESC, COALESCE(r.stars, 0) DESC, s.owner ASC, s.name ASC
         LIMIT ?1`,
        )
        .bind(TOP_N_REPOS)
        .all<SkillRow>()
      const topSkills = topSkillsRes.results ?? []

      const bySlug = new Map<string, SkillRow>()
      for (const s of topSkills)
        bySlug.set(s.slug, s)

      const pending: PendingInsert[] = []

      const siteHits = await hnSearch('skilld.dev')
      for (const hit of siteHits) {
        const slugFromUrl = parseSkilldSlugFromUrl(hit.url) ?? parseSkilldSlugFromUrl(hit.story_text)
        if (!slugFromUrl)
          continue
        const matched = bySlug.get(slugFromUrl)
          ?? topSkills.find(s => slugFromUrl.startsWith(`${s.owner}/${s.repo}`))
        if (!matched)
          continue
        const points = hit.points ?? 0
        const role = hit.author.toLowerCase() === matched.owner.toLowerCase() ? 'author' : 'community'
        pending.push({
          skillSlug: matched.slug,
          postUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          postId: hit.objectID,
          authorHandle: hit.author,
          textExtract: truncate(hit.title ?? hit.story_text ?? '', 500),
          title: hit.title,
          score: points,
          postedAt: hit.created_at_i,
          status: points >= HN_AUTO_APPROVE ? 'approved' : 'pending',
          role,
        })
      }

      const repoTargets = topSkills
        .filter((s, i, arr) => arr.findIndex(x => x.owner === s.owner && x.repo === s.repo) === i)
        .slice(0, TOP_N_REPOS)

      const hnRepoResults = await pAll(repoTargets, HN_CONCURRENCY, async (s) => {
        const q = `github.com/${s.owner}/${s.repo}`
        const hits = await hnSearch(q)
        return { skill: s, hits }
      })

      for (const r of hnRepoResults) {
        if (r.status !== 'fulfilled')
          continue
        const { skill, hits } = r.value
        for (const hit of hits) {
          const parsed = parseGithubRepoFromUrl(hit.url) ?? parseGithubRepoFromUrl(hit.story_text)
          if (!parsed || parsed.owner !== skill.owner.toLowerCase() || parsed.repo !== skill.repo.toLowerCase())
            continue
          const points = hit.points ?? 0
          const role = hit.author.toLowerCase() === skill.owner.toLowerCase() ? 'author' : 'community'
          pending.push({
            skillSlug: skill.slug,
            postUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
            postId: hit.objectID,
            authorHandle: hit.author,
            textExtract: truncate(hit.title ?? hit.story_text ?? '', 500),
            title: hit.title,
            score: points,
            postedAt: hit.created_at_i,
            status: points >= HN_AUTO_APPROVE ? 'approved' : 'pending',
            role,
          })
        }
      }

      const { inserted, dirtySkills } = await insertPosts(db, pending)

      const dirtyRows = topSkills.filter(s => dirtySkills.has(s.slug))
      const enqueued = await enqueueDirty(db, dirtyRows)

      const summary = {
        topSkills: topSkills.length,
        repoTargets: repoTargets.length,
        hnSiteHits: siteHits.length,
        hnRepoQueries: repoTargets.length,
        pending: pending.length,
        inserted,
        dirtyEnqueued: enqueued,
        elapsedMs: Date.now() - startedAt,
      }
      console.warn('[sync-social-mentions] done', summary)
      await reportJobRun(db, 'sync-social-mentions', {
        cron: CRON,
        status: 'ok',
        durationMs: summary.elapsedMs,
      })
      return { result: summary }
    })
  },
})
