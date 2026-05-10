import { z } from 'zod'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const SkillEntry = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  name: z.string().min(1).nullish(),
  reason: z.string().nullish(),
})

export const CreateCollectionInput = z.object({
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, 'Invalid slug'),
  name: z.string().trim().min(1).max(120),
  preamble: z.string().trim().max(4000).nullish().transform(v => v || null),
  skills: z.array(SkillEntry).max(100).default([]),
})

export type CreateCollectionInput = z.infer<typeof CreateCollectionInput>
