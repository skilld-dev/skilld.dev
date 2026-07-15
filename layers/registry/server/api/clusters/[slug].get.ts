import { getDB } from '../../../../../shared/server/db'
import { CLUSTER_BY_SLUG } from '../../data/clusters'

interface SkillRow {
  owner: string
  name: string
  repo: string
  display_name: string
  description: string | null
  installs: number
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

  const countSql = `
    SELECT COUNT(*) AS n
    FROM skills
    WHERE is_abstract = 1
      AND abstractness_category IN (${placeholders})
  `
  const countRow = await db.prepare(countSql).bind(...cluster.categories).first<{ n: number }>()
  const total = countRow?.n ?? 0

  // stars moved to `repos` in migration 0034; JOIN explicitly.
  const listSql = `
    SELECT s.owner, s.name, s.repo, s.display_name, s.description,
           s.installs, r.stars, s.modified_at
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    WHERE s.is_abstract = 1
      AND s.abstractness_category IN (${placeholders})
    ORDER BY s.installs DESC, r.stars DESC
    LIMIT ? OFFSET ?
  `
  const res = await db.prepare(listSql).bind(...cluster.categories, limit, offset).all<SkillRow>()

  const items = (res.results ?? []).map(s => ({
    owner: s.owner,
    name: s.name,
    repo: s.repo,
    displayName: s.display_name,
    description: s.description,
    installs: s.installs,
    stars: s.stars,
    modifiedAt: s.modified_at,
    slug: `${s.owner}/${s.repo}/${s.name}`,
  }))

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
  name: 'clusters-detail-origin-v1',
})
