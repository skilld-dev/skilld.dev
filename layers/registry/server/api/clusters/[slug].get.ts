import type { Cluster } from '../../data/clusters'
import { getDB } from '#server/utils/db'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { CLUSTER_BY_SLUG } from '../../data/clusters'
import { clusterPageSql } from '../../utils/cluster-membership'
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
  repo_skill_count: number
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
  const statements = clusterPageSql(
    'owner, name, repo, display_name, description, stars, modified_at, is_abstract',
    cluster.categories,
    pinnedSkills,
    { limit, offset },
  )

  const countRow = await db.prepare(statements.countSql)
    .bind(...statements.countParams)
    .first<{ n: number }>()
  const total = countRow?.n ?? 0

  const res = await db.prepare(statements.listSql)
    .bind(...statements.listParams)
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
    registryPath: canonicalRepoSkillPath({
      owner: s.owner,
      repo: s.repo,
      name: s.name,
      repoSkillCount: s.repo_skill_count,
    }),
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
  name: 'clusters-detail-origin-v4',
})
