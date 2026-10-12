import { defineApiHandler } from '#shared/server/handler'
import { issueSignupClickProof } from '../../utils/signup-click-proof'

export default defineApiHandler({
  handler: ({ event }) => issueSignupClickProof(event),
  presenter: proof => ({ proof }),
})
