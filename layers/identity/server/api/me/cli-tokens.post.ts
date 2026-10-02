import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { issuePersonalToken } from '../../utils/cli-tokens'

const CliTokenInput = z.object({
  label: z.string().min(1).max(80),
  ttl_days: z.number().int().positive().max(3650).optional(),
})

export default defineApiHandler({
  schema: CliTokenInput,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    return issuePersonalToken(event, user!.id, { label: body.label, ttlDays: body.ttl_days })
  },
})
