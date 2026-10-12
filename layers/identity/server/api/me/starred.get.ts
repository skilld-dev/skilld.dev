import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { starredReposPresenter } from '../../presenters/user'
import { loadStarredRows } from '../../utils/starred-repos'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const state = await platform.db.prepare('SELECT active_partial FROM user_starred_import_state WHERE user_id = ?1')
      .bind(u.id)
      .first<{ active_partial: number }>()
    return {
      ...starredReposPresenter(await loadStarredRows(platform.db, u.id), u.stars_synced_at),
      partial: !!state?.active_partial,
    }
  },
})
