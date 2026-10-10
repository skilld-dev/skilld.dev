import { defineApiHandler } from '#shared/server/handler'
import { SignupBrowserEvent } from '#shared/signup-analytics'
import { identityMutationResponseSchema } from '../../../shared/contracts/account'
import { authenticated } from '../../policies/authenticated'
import { emitSignupEvent } from '../../utils/signup-analytics'

export default defineApiHandler({
  schema: SignupBrowserEvent,
  policy: [authenticated],
  response: identityMutationResponseSchema,
  handler: ({ event, body }) => emitSignupEvent(event, body),
  presenter: () => ({ ok: true as const }),
})
