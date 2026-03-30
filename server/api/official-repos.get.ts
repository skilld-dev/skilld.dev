import { officialRepos } from '../data/official-repos'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()

  let repos = officialRepos
  if (search) {
    repos = officialRepos.filter(r =>
      r.owner.includes(search)
      || r.repo.includes(search),
    )
  }

  const totalSkills = repos.reduce((sum, r) => sum + r.skills, 0)

  return {
    items: repos,
    total: repos.length,
    totalSkills,
  }
})
