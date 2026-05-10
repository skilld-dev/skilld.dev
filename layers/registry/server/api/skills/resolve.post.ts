import { findSkillsByLookups } from '~~/layers/registry/server/utils/skills-registry'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { ResolveSkillsInput } from '../../schemas/resolve-input'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineApiHandler({
  schema: ResolveSkillsInput,
  handler: async ({ event, body }) => {
    if (!body.items.length)
      return {}

    const map = await findSkillsByLookups(event, body.items, { includeBroken: true })
    const result: Record<string, { owner: string, repo: string, official: boolean }> = {}
    for (const [name, skill] of map)
      result[name] = { owner: skill.owner, repo: skill.repo, official: officialOwners.has(skill.owner) }
    return result
  },
})
