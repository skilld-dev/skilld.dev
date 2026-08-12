import { getDB } from '#server/utils/db'
import { CLUSTER_BY_SLUG } from '../../data/clusters'
import { curateClusterSkills, parseClusterSkillKeys } from '../../utils/cluster-skill-curation'

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
  const placeholders = cluster.categories.map(() => '?').join(',')
  const pinnedSkills = parseClusterSkillKeys(cluster.pinnedExamples)
  const pinnedPlaceholders = pinnedSkills.map(() => '?').join(',')
  const pinnedOrderParams = pinnedSkills.flatMap(skill => [skill.owner, skill.name])
  const clusterSql = `(
    (s.is_abstract = 1 AND s.abstractness_category IN (${placeholders}))
    OR (s.owner || '/' || s.name IN (${pinnedPlaceholders}))
  )`
  const clusterParams = [...cluster.categories, ...cluster.pinnedExamples]

  const countSql = `
    SELECT COUNT(*) AS n
    FROM skills s
    WHERE ${clusterSql}
  `
  const countRow = await db.prepare(countSql).bind(...clusterParams).first<{ n: number }>()
  const total = countRow?.n ?? 0

  // stars moved to `repos` in migration 0034; JOIN explicitly.
  const pinnedOrderSql = pinnedSkills
    .map((_, index) => `WHEN s.owner = ? AND s.name = ? THEN ${index}`)
    .join('\n')
  const listSql = `
    SELECT s.owner, s.name, s.repo, s.display_name, s.description,
           r.stars, s.modified_at
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    WHERE ${clusterSql}
    ORDER BY CASE
      ${pinnedOrderSql}
      ELSE ${pinnedSkills.length}
    END, r.stars DESC, s.modified_at DESC, s.name ASC
    LIMIT ? OFFSET ?
  `
  const res = await db.prepare(listSql)
    .bind(...clusterParams, ...pinnedOrderParams, limit, offset)
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
    cluster: {
      slug: cluster.slug,
      label: cluster.label,
      icon: cluster.icon,
      userVoice: cluster.userVoice,
    },
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  }
}, {
  maxAge: 60,
  swr: false,
  name: 'clusters-detail-origin-v2',
})
