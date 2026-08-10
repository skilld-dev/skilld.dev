import { z } from 'zod'

export const LikeCreateInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  name: z.string().min(1),
})

export type LikeCreateInput = z.infer<typeof LikeCreateInput>
