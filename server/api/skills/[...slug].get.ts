import { listCollectionRecords } from '../../utils/atproto/collections'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { findSkill } from '../../utils/skills-registry'

interface CuratorEndorsement {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  collectionName: string
  collectionSlug: string
  reason?: string
}

interface UnghRepo {
  id: number
  name: string
  repo: string
  description: string | null
  createdAt: string
  updatedAt: string
  pushedAt: string
  stars: number
  watchers: number
  forks: number
  defaultBranch: string
}

const ENDORSEMENTS_CACHE_KEY = 'skills:endorsement-map'
const ENDORSEMENTS_CACHE_TTL = 60 * 5 // 5 minutes
const REPO_META_CACHE_TTL = 60 * 15 // 15 minutes

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug)
    throw createError({ statusCode: 400, message: 'Missing skill slug' })

  const skill = await findSkill(event, slug)

  if (!skill)
    throw createError({ statusCode: 404, message: 'Skill not found' })

  const githubUrl = `https://github.com/${skill.owner}/${skill.repo}`
  const rawUrl = skill.repo === 'skills'
    ? `https://raw.githubusercontent.com/${skill.owner}/skills/main/${skill.name}/SKILL.md`
    : `https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/main/SKILL.md`

  // Fetch SKILL.md, curator endorsements, and repo metadata in parallel
  const [content, curators, repoMeta] = await Promise.all([
    $fetch<string>(rawUrl, { responseType: 'text' }).catch((err) => {
      console.warn(`[skills] Failed to fetch SKILL.md from ${rawUrl}:`, err)
      return null
    }),
    getEndorsementsForSkill(getDB(event), skill.name),
    getRepoMeta(skill.owner, skill.repo),
  ])

  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    displayName: skill.displayName,
    installs: skill.installs,
    githubUrl,
    url: `https://skills.sh/${skill.slug}`,
    content,
    curators,
    description: repoMeta?.description ?? null,
    stars: repoMeta?.stars ?? 0,
    forks: repoMeta?.forks ?? 0,
    pushedAt: repoMeta?.pushedAt ?? null,
  }
})

async function getRepoMeta(owner: string, repo: string): Promise<UnghRepo | null> {
  const cacheKey = `skills:repo-meta:${owner}/${repo}`
  const cached = await useStorage('cache').getItem<UnghRepo>(cacheKey)
  if (cached)
    return cached

  const data = await $fetch<{ repo: UnghRepo }>(`https://ungh.cc/repos/${owner}/${repo}`).catch((err) => {
    console.warn(`[skills] Failed to fetch repo meta from ungh.cc:`, err)
    return null
  })

  if (data?.repo)
    await useStorage('cache').setItem(cacheKey, data.repo, { ttl: REPO_META_CACHE_TTL })

  return data?.repo ?? null
}

async function getEndorsementsForSkill(db: D1Database, skillName: string): Promise<CuratorEndorsement[]> {
  // Check for cached endorsement map
  let endorsementMap = await useStorage('cache').getItem<Record<string, CuratorEndorsement[]>>(ENDORSEMENTS_CACHE_KEY)

  if (!endorsementMap) {
    endorsementMap = await buildEndorsementMap(db)
    await useStorage('cache').setItem(ENDORSEMENTS_CACHE_KEY, endorsementMap, { ttl: ENDORSEMENTS_CACHE_TTL })
  }

  return endorsementMap[skillName] ?? []
}

async function buildEndorsementMap(db: D1Database): Promise<Record<string, CuratorEndorsement[]>> {
  const curators = await getAllCurators(db)
  const map: Record<string, CuratorEndorsement[]> = {}

  const results = await Promise.allSettled(curators.map(async (curator) => {
    const records = await listCollectionRecords(curator.did)

    for (const { record } of records) {
      for (const skill of record.skills) {
        const endorsement: CuratorEndorsement = {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
          collectionName: record.name,
          collectionSlug: record.slug,
          reason: skill.reason,
        }
        if (!map[skill.packageName])
          map[skill.packageName] = []
        map[skill.packageName]!.push(endorsement)
      }
    }
  }))

  for (const result of results) {
    if (result.status === 'rejected')
      console.warn('[endorsement-map] Failed to fetch curator collections:', result.reason)
  }

  return map
}
