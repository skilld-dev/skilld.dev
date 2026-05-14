import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../policies/authenticated'
import { issueSession } from '../../utils/cli-tokens'

const CliTokenInput = z.object({
  label: z.string().min(1).max(80),
  ttl_days: z.number().int().positive().max(3650).optional(),
})

export default defineApiHandler({
  schema: CliTokenInput,
  policy: [authenticated],
  handler: async ({ event, body, user }) => {
    return issueSession(event, user!.id, {
      kind: 'pat',
      scopes: 'cli',
      deviceLabel: body.label,
      ttlSec: body.ttl_days ? body.ttl_days * 86400 : undefined,
      refresh: false,
    })
  },
})
