import { officialRepos } from '../../data/official-repos'

const officialOwners = new Set(officialRepos.map(r => r.owner))

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 60, 200)
  const sort = (query.sort as string) || 'name'
  const official = query.official === 'true' || query.official === '1'
  const owner = (query.owner as string || '').toLowerCase().trim()

  const skills = await getSkillsFromSitemap()

  let filtered = skills

  // Text search
  if (search) {
    filtered = filtered.filter(s =>
      s.name.includes(search)
      || s.owner.includes(search)
      || s.slug.includes(search),
    )
  }

  // Official filter
  if (official) {
    filtered = filtered.filter(s => officialOwners.has(s.owner))
  }

  // Owner filter
  if (owner) {
    filtered = filtered.filter(s => s.owner === owner)
  }

  // Sort
  if (sort === 'owner') {
    filtered = [...filtered].sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name))
  }
  else {
    // default: name
    filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }

  // Compute owner facets from filtered results (before pagination)
  const ownerCounts = new Map<string, number>()
  for (const s of filtered) {
    ownerCounts.set(s.owner, (ownerCounts.get(s.owner) || 0) + 1)
  }
  const ownerFacets = [...ownerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count, official: officialOwners.has(name) }))

  const total = filtered.length
  const offset = (page - 1) * limit
  const items = filtered.slice(offset, offset + limit)

  return {
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
    facets: { owners: ownerFacets },
  }
})
