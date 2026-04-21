import type { SkillLookup } from '../../utils/skills-registry'
import { officialRepos } from '../../data/official-repos'
import { findSkillsByLookups } from '../../utils/skills-registry'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineEventHandler(async (event) => {
  const body = await readBody<{ items?: SkillLookup[] }>(event)
  const items = body?.items?.filter(i => typeof i?.packageName === 'string').slice(0, 200) ?? []
  if (!items.length)
    return {}

  const map = await findSkillsByLookups(event, items)
  const result: Record<string, { owner: string, repo: string, official: boolean }> = {}
  for (const [name, skill] of map)
    result[name] = { owner: skill.owner, repo: skill.repo, official: officialOwners.has(skill.owner) }
  return result
})
