import { z } from 'zod'

export const UnsubQuery = z.object({
  t: z.string().min(1),
})
