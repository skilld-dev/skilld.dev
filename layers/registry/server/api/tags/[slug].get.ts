import type { RegistrySkill } from '~~/layers/registry/server/utils/skills-registry'
/// <reference types="@cloudflare/workers-types" />
import type { TagPayload } from '../../jobs/generate-tags'
import { notBrokenSql } from '~~/layers/registry/server/utils/broken'
import { getGeneratedBatch } from '~~/layers/registry/server/utils/skill-generated'
import { getDB } from '../../../../../shared/server/db'
import { TAG_BY_SLUG } from '../../jobs/taxonomy'

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
  fetchedAt: string
}

const NOT_BROKEN_SQL = notBrokenSql('r')

interface SkillRow {
  name: string
  owner: string
  repo: string
  display_name: string
  installs: number
  slug: string
  stars: number | null
  description: string | null
  pushed_at: number | null
  modified_at: number | null
}

function rowToSkill(r: SkillRow): RegistrySkill {
  return {
    name: r.name,
    owner: r.owner,
    repo: r.repo,
    displayName: r.display_name,
    installs: r.installs,
    slug: r.slug,
    stars: r.stars ?? 0,
    description: r.description ?? null,
    pushedAt: r.pushed_at ?? null,
    modifiedAt: r.modified_at ?? null,
    seoIndexScore: 0,
    seoIndexable: false,
    trustTier: 'untrusted',
    trustScore: 0,
  }
}

export default defineCachedEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()

  // Marketing/cluster landing pages own these slugs. Hand off so crawl
  // signal accumulates on the canonical URL instead of splitting.
  const redirect = getTagRedirect(slug)
  if (redirect)
    return sendRedirect(event, redirect, 301)

  const db = getDB(event)
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
  const ftsQuery = `"${slug}"*`

  // Skills matching by:
  //   1. FTS on name/owner/display_name/slug (broad, catches `nuxt-ui`, `nuxt`)
  //   2. Exact owner = slug (the official org's repos, e.g. owner='nuxt')
  //   3. AI-classified tags (skill_generated kind='tags')
  // stars/pushed_at/broken_since live on `repos` (post-0034); JOIN explicitly.
  // FTS post-0049 indexes `repo` too, so the tuple match is precise across
  // same-(owner,name) collisions.
  const skillsRes = await db
    .prepare(
      `SELECT DISTINCT s.name, s.owner, s.repo, s.display_name, s.installs, s.slug, r.stars, s.description, r.pushed_at, s.modified_at
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
       ORDER BY s.installs DESC, r.stars DESC, s.name ASC
       LIMIT 200`,
    )
    .bind(ftsQuery, slug, slug)
    .all<SkillRow>()

  const skills: RegistrySkill[] = (skillsRes.results ?? []).map(rowToSkill)
  if (!skills.length)
    throw createError({ statusCode: 404, message: `No skills tagged ${slug}` })

  const ownerAgg = new Map<string, { count: number, stars: number, installs: number }>()
  for (const s of skills) {
    const entry = ownerAgg.get(s.owner) ?? { count: 0, stars: 0, installs: 0 }
    entry.count++
    entry.installs += s.installs
    if (s.stars > entry.stars)
      entry.stars = s.stars
    ownerAgg.set(s.owner, entry)
  }

  const topOwners: TagOwner[] = [...ownerAgg.entries()]
    .sort((a, b) => b[1].installs - a[1].installs || b[1].count - a[1].count)
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

  const profile: TagProfile = {
    tag: { slug: tag.slug, label: tag.label, description: tag.description },
    totalSkills: skills.length,
    totalStars,
    topOwners,
    skills,
    relatedTags,
    fetchedAt: new Date().toISOString(),
  }

  return profile
}, {
  maxAge: 60 * 5,
  swr: true,
  getKey: (event) => {
    const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
    return `tag:v1:${slug}`
  },
})
