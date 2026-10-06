import { z } from 'zod'

/** `owner/repository/name`, with the segments GitHub and the registry allow. */
const SKILL_REF = /^[a-z0-9-]{1,39}\/[\w.-]{1,100}\/[^/\s]{1,64}$/i

/** No `skill` lists every flag. A `skill` limits the answer to that Skill. */
export const runCheckFlagsQuerySchema = z.object({
  skill: z.string().regex(SKILL_REF).optional(),
}).strict()

export type RunCheckFlagsQuery = z.infer<typeof runCheckFlagsQuerySchema>
