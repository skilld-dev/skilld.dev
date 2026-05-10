import { querySkills } from '~~/layers/registry/server/utils/skills-registry'
import { defineApiHandler } from '#shared/server/handler'
import { officialRepos } from '../../data/official-repos'
import { makeOwnerFacetPresenter, makeSkillPresenter } from '../../presenters/skill'
import { SkillsListQuery } from '../../schemas/skills-query'

const officialOwners = new Set(officialRepos.map(r => r.owner))
const skillPresenter = makeSkillPresenter(officialOwners)
const ownerFacetPresenter = makeOwnerFacetPresenter(officialOwners)

export default defineApiHandler({
  schema: SkillsListQuery,
  handler: async ({ event, body }) => {
    const result = await querySkills(event, {
      search: body.q || undefined,
      owner: body.owner || undefined,
      official: body.official,
      excludeOfficial: body.excludeOfficial,
      supportedOnly: body.supported,
      trustTier: body.trustTier || undefined,
      category: body.category || undefined,
      sort: body.sort,
      page: body.page,
      limit: body.limit,
      officialOwners,
    })

    return {
      items: result.items.map(skillPresenter),
      total: result.total,
      page: result.page,
      pages: result.pages,
      facets: { owners: result.facets.map(ownerFacetPresenter) },
    }
  },
})
