import { officialRepos } from '../../data/official-repos'
import { findSkillsByNames } from '../../utils/skills-registry'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineEventHandler(async (event) => {
  const body = await readBody<{ names: string[] }>(event)
  if (!body?.names?.length)
    return {}

  const map = await findSkillsByNames(event, body.names.slice(0, 200))
  const result: Record<string, { owner: string, repo: string, official: boolean }> = {}
  for (const [name, skill] of map)
    result[name] = { owner: skill.owner, repo: skill.repo, official: officialOwners.has(skill.owner) }
  return result
})
