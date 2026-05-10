import { z } from 'zod'

export const ResolveSkillsInput = z.object({
  items: z.array(z.object({
    packageName: z.string().min(1),
    owner: z.string().optional(),
  })).max(200).default([]),
})

export type ResolveSkillsInput = z.infer<typeof ResolveSkillsInput>
