import { officialRepos } from '../../data/official-repos'
import { querySkills } from '../../utils/skills-registry'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 60, 200)
  const sort = (query.sort as string) || 'installs'
  const official = query.official === 'true' || query.official === '1'
  const excludeOfficial = query.excludeOfficial === 'true' || query.excludeOfficial === '1'
  const owner = (query.owner as string || '').toLowerCase().trim()

  const result = await querySkills(event, {
    search: search || undefined,
    owner: owner || undefined,
    official,
    excludeOfficial,
    sort: sort as 'installs' | 'name' | 'owner',
    page,
    limit,
    officialOwners,
  })

  const ownerFacets = result.facets.map(f => ({
    name: f.owner,
    count: f.count,
    official: officialOwners.has(f.owner),
  }))

  return {
    items: result.items.map(s => ({
      ...s,
      official: officialOwners.has(s.owner),
    })),
    total: result.total,
    page: result.page,
    pages: result.pages,
    facets: { owners: ownerFacets },
  }
})
