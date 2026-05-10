import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { starredReposPresenter } from '../../presenters/user'
import { requireUserRow } from '../../utils/users'

interface Row {
  owner: string
  repo: string
  starred_at: number
  has_skill: number
  watching: number
  skill_name: string | null
  skill_display: string | null
  skill_slug: string | null
}

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const res = await platform.db.prepare(
      `SELECT s.owner, s.repo, s.starred_at, s.has_skill,
              CASE WHEN sub.user_id IS NULL THEN 0 ELSE 1 END as watching,
              sk.name as skill_name, sk.display_name as skill_display, sk.slug as skill_slug
       FROM user_starred_repos s
       LEFT JOIN skills sk ON sk.owner = s.owner AND sk.repo = s.repo
       LEFT JOIN skill_subscriptions sub ON sub.user_id = s.user_id AND sub.owner = s.owner AND sub.repo = s.repo
       WHERE s.user_id = ?1
       ORDER BY s.has_skill DESC, s.starred_at DESC, sk.name
       LIMIT 1000`,
    ).bind(u.id).all<Row>()
    return starredReposPresenter(res.results ?? [], u.stars_synced_at)
  },
})
