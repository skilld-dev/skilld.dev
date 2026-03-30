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

const ENDORSEMENTS_CACHE_KEY = 'skills:endorsement-map'
const ENDORSEMENTS_CACHE_TTL = 60 * 5 // 5 minutes

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

  // Fetch SKILL.md and curator endorsements in parallel
  const [content, curators] = await Promise.all([
    $fetch<string>(rawUrl, { responseType: 'text' }).catch(() => null),
    getEndorsementsForSkill(getDB(event), skill.name),
  ])

  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    displayName: skill.displayName,
    installs: skill.installs,
    githubUrl,
    content,
    curators,
  }
})

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
