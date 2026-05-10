import { officialRepos } from '~~/layers/registry/server/data/official-repos'
import { defineApiHandler } from '#shared/server/handler'
import { OfficialReposQuery } from '../schemas/skills-query'

export default defineApiHandler({
  schema: OfficialReposQuery,
  handler: async ({ body, platform }) => {
    const search = body.q
    const repos = search
      ? officialRepos.filter(r => r.owner.includes(search) || r.repo.includes(search))
      : officialRepos

    const placeholders = repos.map(() => '?').join(',')
    const counts = repos.length
      ? await platform.db.prepare(
          `SELECT owner, repo, COUNT(*) as count FROM skills WHERE owner IN (${placeholders}) GROUP BY owner, repo`,
        ).bind(...repos.map(r => r.owner)).all<{ owner: string, repo: string, count: number }>()
      : { results: [] }
    const countByKey = new Map<string, number>()
    for (const r of counts.results ?? [])
      countByKey.set(`${r.owner}/${r.repo}`, r.count)

    const items = repos.map(r => ({ ...r, skills: countByKey.get(`${r.owner}/${r.repo}`) ?? 0 }))
    const totalSkills = items.reduce((sum, r) => sum + r.skills, 0)

    return { items, total: items.length, totalSkills }
  },
})
