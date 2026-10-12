import { z } from 'zod'

export const StarsSyncQuery = z.object({
  importId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10).catch(1),
})

export type StarsSyncQuery = z.infer<typeof StarsSyncQuery>
