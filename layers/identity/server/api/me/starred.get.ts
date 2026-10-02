import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { starredReposPresenter } from '../../presenters/user'
import { loadStarredRows } from '../../utils/starred-repos'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    return starredReposPresenter(await loadStarredRows(platform.db, u.id), u.stars_synced_at)
  },
})
