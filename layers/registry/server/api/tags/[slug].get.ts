/// <reference types="@cloudflare/workers-types" />
import type { TagPayload } from '../../jobs/generate-tags'
import type { RegistrySkill } from '../../utils/skills-registry'
import type { TagSkillRow } from '../../utils/tag-profile'
import { getDB } from '#server/utils/db'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'
import { notBrokenSql } from '../../utils/broken'
import { getGeneratedBatch } from '../../utils/skill-generated'
import { buildIdentifierFtsQuery } from '../../utils/skill-search'
import { parseTagSkillRow } from '../../utils/tag-profile'

import { getTagRedirect, isQualityDerivedTag } from '../../utils/tag-quality'

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function derivedTagCount(db: D1Database, slug: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT sg.owner || '/' || sg.repo || '/' || sg.name) AS count
       FROM skill_generated sg, json_each(sg.payload, '$.tags') je
       WHERE sg.kind = 'tags' AND je.value = ?`,
    )
    .bind(slug)
    .first<{ count: number }>()
  return row?.count ?? 0
}

// Curated indexability for derived tags (migration 0064). A derived tag earns
// an indexable page only when a sub-agent audit ticked it (keep=1). Absent or
// crossed → the page still renders for internal nav but is noindex + omitted
// from the sitemap.
async function tagDecisionKeep(db: D1Database, slug: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT keep FROM tag_decisions WHERE slug = ?`)
    .bind(slug)
    .first<{ keep: number }>()
  return row?.keep === 1
}

export interface TagOwner {
  owner: string
  count: number
  stars: number
  avatar: string
}

export interface RelatedTag {
  slug: string
  label: string
  count: number
}

export interface TagProfile {
  tag: { slug: string, label: string, description: string }
  totalSkills: number
  totalStars: number
  topOwners: TagOwner[]
  skills: RegistrySkill[]
  relatedTags: RelatedTag[]
  indexable: boolean
  fetchedAt: string
}

const NOT_BROKEN_SQL = notBrokenSql('r')

export default defineCachedEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
  const dataView = getQuery(event).view === 'data'

  // Marketing/cluster landing pages own these slugs. Hand off so crawl
  // signal accumulates on the canonical URL instead of splitting. Their SSR
  // data requests opt out explicitly so they can still reuse this profile.
  const redirect = getTagRedirect(slug)
  if (redirect && !dataView)
    return sendRedirect(event, redirect, 301)

  const db = getDB(event)
  const isControlledVocab = TAG_BY_SLUG.has(slug)
  let tag = TAG_BY_SLUG.get(slug)
  if (!tag) {
    // Long-tail: AI-derived tag must pass the quality gate before earning
    // its own landing page. Anything that fails the gate 404s rather than
    // rendering a thin page that drags domain authority.
    const count = await derivedTagCount(db, slug)
    if (!isQualityDerivedTag(slug, count))
      throw createError({ statusCode: 404, message: `Unknown tag: ${slug}` })
    const label = humanizeSlug(slug)
    tag = { slug, label, description: `Skills tagged ${label}.` }
  }
  // Identifier-qualified on purpose: this page answers "which skills *are*
  // this tag", not "which skills mention the word". See buildIdentifierFtsQuery.
  const ftsQuery = buildIdentifierFtsQuery(slug) ?? `"${slug}"*`

  // Skills matching by:
  //   1. FTS on name/owner/repo/display_name/slug (broad, catches `nuxt-ui`, `nuxt`)
  //   2. Exact owner = slug (the official org's repos, e.g. owner='nuxt')
  //   3. AI-classified tags (skill_generated kind='tags')
  // stars/pushed_at/broken_since live on `repos` (post-0034); JOIN explicitly.
  // FTS post-0049 indexes `repo` too, so the tuple match is precise across
  // same-(owner,name) collisions.
  const skillsRes = await db
    .prepare(
      `SELECT DISTINCT s.name, s.owner, s.repo, s.display_name, s.slug, r.stars, s.like_count, s.description, s.rendered_raw_sha256, r.pushed_at, s.modified_at, s.first_seen_at,
              s.rendered_skill_path, s.current_sha, r.default_branch, r.source_owner, r.source_repo,
              (SELECT o.name FROM owners o WHERE o.owner = s.owner) AS author_name,
              (SELECT COUNT(*) FROM skills repo_skills
               WHERE repo_skills.owner = s.owner
                 AND repo_skills.repo = s.repo
                 AND repo_skills.source_resolved = 1) AS repo_skill_count
       FROM skills s
       JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
       WHERE ${NOT_BROKEN_SQL} AND (
         (s.owner, s.repo, s.name) IN (SELECT owner, repo, name FROM skills_fts WHERE skills_fts MATCH ?)
         OR s.owner = ?
         OR EXISTS (
           SELECT 1 FROM skill_generated sg, json_each(sg.payload, '$.tags') je
           WHERE sg.owner = s.owner AND sg.repo = s.repo AND sg.name = s.name
             AND sg.kind = 'tags' AND je.value = ?
         )
       )
       ORDER BY r.stars DESC, s.name ASC
       LIMIT 200`,
    )
    .bind(ftsQuery, slug, slug)
    .all<TagSkillRow>()

  const parsedSkills = (skillsRes.results ?? []).map(parseTagSkillRow)
  const invalidSkillCount = parsedSkills.filter(result => result._tag === 'invalid').length
  if (invalidSkillCount) {
    emitOperationalEvent(createWideEvent({
      'operation': 'tag-profile-parse',
      'outcome': 'invalid-items-excluded',
      'item.count': invalidSkillCount,
    }))
  }
  const skills: RegistrySkill[] = parsedSkills.flatMap(result =>
    result._tag === 'valid' ? [result.skill] : [],
  )
  if (!skills.length)
    throw createError({ statusCode: 404, message: `No skills tagged ${slug}` })

  const ownerAgg = new Map<string, { count: number, stars: number }>()
  for (const s of skills) {
    const entry = ownerAgg.get(s.owner) ?? { count: 0, stars: 0 }
    entry.count++
    if (s.stars > entry.stars)
      entry.stars = s.stars
    ownerAgg.set(s.owner, entry)
  }

  const topOwners: TagOwner[] = [...ownerAgg.entries()]
    .sort((a, b) => b[1].stars - a[1].stars || b[1].count - a[1].count)
    .slice(0, 8)
    .map(([owner, v]) => ({
      owner,
      count: v.count,
      stars: v.stars,
      avatar: `https://github.com/${owner}.png`,
    }))

  const tagMap = await getGeneratedBatch<TagPayload>(
    db,
    skills.map(s => ({ owner: s.owner, repo: s.repo, name: s.name })),
    'tags',
  )
  const relatedCounts = new Map<string, number>()
  for (const row of tagMap.values()) {
    for (const t of row.payload.tags ?? []) {
      if (t === slug)
        continue
      relatedCounts.set(t, (relatedCounts.get(t) ?? 0) + 1)
    }
  }
  const relatedTags: RelatedTag[] = [...relatedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s, count]) => {
      const t = TAG_BY_SLUG.get(s)
      return t ? { slug: t.slug, label: t.label, count } : null
    })
    .filter((r): r is RelatedTag => r !== null)

  const totalStars = skills.reduce((sum, s) => sum + s.stars, 0)

  // 2026-08-22: tag pages are noindex sitewide (GOOGLE_RECOVERY.md, sitemap
  // topology audit). Controlled vocab no longer bypasses; the only path back
  // to indexable is an editorial keep=1 row for a vocab tag (see
  // __sitemap__/tags.ts). Page still renders for internal nav.
  const indexable = await tagDecisionKeep(db, slug) && isControlledVocab

  const profile: TagProfile = {
    tag: { slug: tag.slug, label: tag.label, description: tag.description },
    totalSkills: skills.length,
    totalStars,
    topOwners,
    skills,
    relatedTags,
    indexable,
    fetchedAt: new Date().toISOString(),
  }

  return profile
}, {
  maxAge: 60,
  swr: false,
  getKey: (event) => {
    const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
    const view = getQuery(event).view === 'data' ? 'data' : 'canonical'
    return `tag-origin:v2:${slug}:${view}`
  },
})
