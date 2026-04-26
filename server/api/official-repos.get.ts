import { officialRepos } from '../data/official-repos'
import { getDB } from '../utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string || '').toLowerCase().trim()

  let repos = officialRepos
  if (search) {
    repos = officialRepos.filter(r =>
      r.owner.includes(search)
      || r.repo.includes(search),
    )
  }

  // Derive live skill counts per (owner, repo) from D1 so the manifest
  // doesn't drift; cheap (~91 owners) since we group in one query.
  const db = getDB(event)
  const placeholders = repos.map(() => '?').join(',')
  const counts = repos.length
    ? await db
        .prepare(`SELECT owner, repo, COUNT(*) as count FROM skills WHERE owner IN (${placeholders}) GROUP BY owner, repo`)
        .bind(...repos.map(r => r.owner))
        .all<{ owner: string, repo: string, count: number }>()
    : { results: [] }
  const countByKey = new Map<string, number>()
  for (const r of counts.results ?? [])
    countByKey.set(`${r.owner}/${r.repo}`, r.count)

  const items = repos.map(r => ({ ...r, skills: countByKey.get(`${r.owner}/${r.repo}`) ?? 0 }))
  const totalSkills = items.reduce((sum, r) => sum + r.skills, 0)

  return {
    items,
    total: items.length,
    totalSkills,
  }
})
