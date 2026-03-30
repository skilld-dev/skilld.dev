import { getPublicAgent } from '../../utils/atproto/agent'
import { getAllCurators } from '../../utils/atproto/curator-index'
import { COLLECTION_NSID, parseCollectionRecord } from '../../utils/atproto/lexicons/collection'

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

  const skills = await getSkillsFromSitemap()

  const skill = skills.find((s) => {
    const fullSlug = s.repo === 'skills'
      ? `${s.owner}/${s.name}`
      : `${s.owner}/${s.repo}/${s.name}`
    return fullSlug === slug || s.slug === slug
  })

  if (!skill)
    throw createError({ statusCode: 404, message: 'Skill not found' })

  const githubUrl = `https://github.com/${skill.owner}/${skill.repo}`
  const rawUrl = skill.repo === 'skills'
    ? `https://raw.githubusercontent.com/${skill.owner}/skills/main/${skill.name}/SKILL.md`
    : `https://raw.githubusercontent.com/${skill.owner}/${skill.repo}/main/SKILL.md`

  // Fetch SKILL.md and curator endorsements in parallel
  const [content, curators] = await Promise.all([
    $fetch<string>(rawUrl, { responseType: 'text' }).catch(() => null),
    getEndorsementsForSkill(skill.name),
  ])

  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    url: skill.url,
    githubUrl,
    content,
    curators,
  }
})

async function getEndorsementsForSkill(skillName: string): Promise<CuratorEndorsement[]> {
  // Check for cached endorsement map
  let endorsementMap = await useStorage('data').getItem<Record<string, CuratorEndorsement[]>>(ENDORSEMENTS_CACHE_KEY)

  if (!endorsementMap) {
    endorsementMap = await buildEndorsementMap()
    await useStorage('data').setItem(ENDORSEMENTS_CACHE_KEY, endorsementMap, { ttl: ENDORSEMENTS_CACHE_TTL })
  }

  return endorsementMap[skillName] ?? []
}

async function buildEndorsementMap(): Promise<Record<string, CuratorEndorsement[]>> {
  const curators = await getAllCurators()
  const agent = getPublicAgent()
  const map: Record<string, CuratorEndorsement[]> = {}

  await Promise.all(curators.map(async (curator) => {
    const res = await agent.com.atproto.repo.listRecords({
      repo: curator.did,
      collection: COLLECTION_NSID,
      limit: 100,
    }).catch(() => null)

    if (!res?.data.records)
      return

    for (const record of res.data.records) {
      const val = parseCollectionRecord(record.value)
      if (!val)
        continue
      for (const skill of val.skills) {
        const endorsement: CuratorEndorsement = {
          did: curator.did,
          handle: curator.handle,
          displayName: curator.displayName,
          avatar: curator.avatar,
          collectionName: val.name,
          collectionSlug: val.slug,
          reason: skill.reason,
        }
        if (!map[skill.packageName])
          map[skill.packageName] = []
        map[skill.packageName]!.push(endorsement)
      }
    }
  }))

  return map
}
