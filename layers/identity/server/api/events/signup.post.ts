import { defineApiHandler } from '#shared/server/handler'
import { SignupBrowserEvent } from '#shared/signup-analytics'
import { identityMutationResponseSchema } from '../../../shared/contracts/account'
import { signupEventAllowed } from '../../policies/signup-event'
import { emitSignupEvent } from '../../utils/signup-analytics'

export default defineApiHandler({
  schema: SignupBrowserEvent,
  policy: [signupEventAllowed],
  response: identityMutationResponseSchema,
  handler: ({ event, body }) => emitSignupEvent(event, body),
  presenter: () => ({ ok: true as const }),
})
