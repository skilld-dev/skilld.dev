import type { Cluster } from '../../data/clusters'
import { getDB } from '#server/utils/db'
import { CLUSTER_BY_SLUG } from '../../data/clusters'
import { clusterMembersSql } from '../../utils/cluster-membership'
import { curateClusterSkills, parseClusterSkillKeys } from '../../utils/cluster-skill-curation'

function clusterMeta(cluster: Cluster) {
  return {
    slug: cluster.slug,
    label: cluster.label,
    icon: cluster.icon,
    userVoice: cluster.userVoice,
    seoTitle: cluster.seoTitle,
    seoDescription: cluster.seoDescription,
    curatorNote: cluster.curatorNote,
  }
}

interface SkillRow {
  owner: string
  name: string
  repo: string
  display_name: string
  description: string | null
  stars: number
  modified_at: number | null
}

export default defineCachedEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') || ''
  const cluster = CLUSTER_BY_SLUG.get(slug)
  if (!cluster) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown cluster' })
  }

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(120, Math.max(1, Number(query.limit) || 60))
  const offset = (page - 1) * limit

  const db = getDB(event)
  const pinnedSkills = parseClusterSkillKeys(cluster.pinnedExamples)

  // A category admitted before its skills are curated has empty `categories`
  // and empty `pinnedExamples`. Interpolating those into `IN ()` is a SQL
  // syntax error, so answer from the shape of the taxonomy instead of asking
  // D1 a question with no terms. The page still renders its own metadata; it
  // just has nothing to list yet.
  if (!cluster.categories.length && !pinnedSkills.length) {
    return {
      cluster: clusterMeta(cluster),
      items: [],
      total: 0,
      page,
      pages: 1,
    }
  }

  // Membership is abstract-first with a capped backfill; see cluster-membership.
  const members = clusterMembersSql(
    'owner, name, repo, display_name, description, stars, modified_at, is_abstract',
    cluster.categories,
    pinnedSkills.map(skill => skill.key),
  )

  const countRow = await db.prepare(`SELECT COUNT(*) AS n FROM (${members.sql})`)
    .bind(...members.params)
    .first<{ n: number }>()
  const total = countRow?.n ?? 0

  // `CASE` with no `WHEN` is a syntax error, so a category that ranks purely on
  // stars drops the pinned-order arm rather than emitting an empty CASE.
  const pinnedOrderSql = pinnedSkills.length
    ? `CASE
      ${pinnedSkills.map((_, index) => `WHEN owner = ? AND name = ? THEN ${index}`).join('\n')}
      ELSE ${pinnedSkills.length}
    END,`
    : ''
  const pinnedOrderParams = pinnedSkills.flatMap(skill => [skill.owner, skill.name])
  const listSql = `
    SELECT * FROM (${members.sql})
    ORDER BY ${pinnedOrderSql} is_abstract DESC, stars DESC, modified_at DESC, name ASC
    LIMIT ? OFFSET ?
  `
  const res = await db.prepare(listSql)
    .bind(...members.params, ...pinnedOrderParams, limit, offset)
    .all<SkillRow>()

  const rankedItems = (res.results ?? []).map(s => ({
    owner: s.owner,
    name: s.name,
    repo: s.repo,
    displayName: s.display_name,
    description: s.description,
    stars: s.stars,
    modifiedAt: s.modified_at,
    slug: `${s.owner}/${s.repo}/${s.name}`,
  }))
  const items = page === 1
    ? curateClusterSkills(rankedItems, cluster.pinnedExamples)
    : rankedItems

  return {
    cluster: clusterMeta(cluster),
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  }
}, {
  maxAge: 60,
  swr: false,
  name: 'clusters-detail-origin-v3',
})
