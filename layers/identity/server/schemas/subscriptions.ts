import { z } from 'zod'

export const SubscriptionsCreateInput = z.object({
  source: z.string().min(1).default('manual'),
  repos: z.array(z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
  })).default([]),
})

export type SubscriptionsCreateInput = z.infer<typeof SubscriptionsCreateInput>
