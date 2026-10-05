import { z } from 'zod'

export const digestPreviewSchema = z.object({
  login: z.string().trim().min(1).max(80).default('harlan-zw'),
  // Explicit destination prevents accidentally mailing the selected account.
  to: z.string().email().optional(),
})
