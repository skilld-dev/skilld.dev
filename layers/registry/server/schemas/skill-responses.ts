import { AuditEntrySchema } from 'skilld-protocol/wire'
import { z } from 'zod'

export const SkillAuditResponseSchema = z.object({
  id: z.string(),
  audits: z.array(AuditEntrySchema),
  source: z.literal('skills.sh'),
  fetchedAt: z.string(),
}).strict()

export type SkillAuditResponse = z.infer<typeof SkillAuditResponseSchema>

export const SkillDetailResponseSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
  repoSkillCount: z.number().int().nonnegative(),
  displayName: z.string(),
  stars: z.number(),
  branch: z.string(),
  skillPath: z.string().nullable(),
  raw: z.string().nullable(),
  pushedAt: z.string().nullable(),
}).passthrough().refine(
  response => !Object.hasOwn(response, 'installs'),
  { message: 'Retired install fields must not be emitted' },
)
