import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { mePresenter } from '../../presenters/user'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  presenter: mePresenter,
  handler: ({ event }) => requireUserRow(event),
})
