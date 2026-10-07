import { z } from 'zod'

/** The Git blob SHA of the SKILL.md a Skill page shows. */
export const behaviorReadingsQuerySchema = z.object({
  blob: z.string().regex(/^[0-9a-f]{40}$/),
}).strict()

export type BehaviorReadingsQuery = z.infer<typeof behaviorReadingsQuerySchema>
