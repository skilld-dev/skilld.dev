import { defineApiHandler } from '#shared/server/handler'
import { identityMeSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { mePresenter } from '../../presenters/user'
import { requireUserRow } from '../../utils/users'

export default defineApiHandler({
  policy: [authenticated],
  response: identityMeSchema,
  presenter: mePresenter,
  handler: ({ event }) => requireUserRow(event),
})
