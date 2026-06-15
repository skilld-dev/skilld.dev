import { SkillsResolveInputSchema, SkillsResolveResponseSchema } from 'skilld-protocol/wire'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { findSkillsByLookups } from '../../utils/skills-registry'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineApiHandler({
  schema: SkillsResolveInputSchema,
  response: SkillsResolveResponseSchema,
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
