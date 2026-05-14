import { z } from 'zod'

export const CollectionSkillRefInput = z.object({
  owner: z.string().trim().min(1),
  repo: z.string().trim().min(1),
  name: z.string().trim().min(1).nullish().transform(v => v || null),
  reason: z.string().trim().max(2000).nullish().transform(v => v || null),
})

export type CollectionSkillRefInput = z.infer<typeof CollectionSkillRefInput>
