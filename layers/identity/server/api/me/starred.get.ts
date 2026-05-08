import { requireUserRow } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const db = event.context.cloudflare.env.DB as D1Database
  const res = await db.prepare(
    `SELECT owner, repo, starred_at, has_skill
     FROM user_starred_repos
     WHERE user_id = ?1
     ORDER BY has_skill DESC, starred_at DESC
     LIMIT 500`,
  ).bind(u.id).all<{ owner: string, repo: string, starred_at: number, has_skill: number }>()
  return {
    items: (res.results ?? []).map(r => ({
      owner: r.owner,
      repo: r.repo,
      starredAt: r.starred_at,
      hasSkill: !!r.has_skill,
    })),
    syncedAt: u.stars_synced_at,
  }
})
