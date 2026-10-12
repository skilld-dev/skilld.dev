import type { Policy } from '#shared/server/handler'
import type { SignupBrowserEvent } from '#shared/signup-analytics'
import { authenticated } from './authenticated'

/** Anonymous browsers may record clicks, but cannot claim account setup outcomes. */
export const signupEventAllowed: Policy<SignupBrowserEvent> = context =>
  context.body.stage === 'oauth' || authenticated(context)
