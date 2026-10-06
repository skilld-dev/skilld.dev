import { z } from 'zod'

const githubName = z.string().regex(/^[\w.-]{1,100}$/)

export const SkillgenRepositoryPutBody = z.object({
  owner: githubName,
  repo: githubName,
  optedIn: z.boolean(),
})

export type SkillgenRepositoryPutBody = z.infer<typeof SkillgenRepositoryPutBody>

/** The skill-harness Worker asks about one GitHub event's repositories at a time. */
export const SkillgenOptInsBody = z.object({
  repositories: z.array(z.string().regex(/^[\w.-]{1,100}\/[\w.-]{1,100}$/)).max(100),
})
