import { z } from 'zod'

const flag = z.string().optional().transform(v => v === 'true' || v === '1')

export const SkillsListQuery = z.object({
  q: z.string().trim().toLowerCase().default(''),
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(200).catch(60),
  sort: z.enum(['installs', 'name', 'owner']).catch('installs'),
  official: flag,
  excludeOfficial: flag,
  supported: flag,
  trustTier: z.string().trim().toLowerCase().default(''),
  owner: z.string().trim().toLowerCase().default(''),
  category: z.string().trim().toLowerCase().default(''),
  tags: z
    .string()
    .trim()
    .toLowerCase()
    .default('')
    .transform(v =>
      v
        ? v
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
        : [],
    ),
  tagMode: z.enum(['and', 'or']).catch('and'),
})

export const OfficialReposQuery = z.object({
  q: z.string().trim().toLowerCase().default(''),
})

export type SkillsListQuery = z.infer<typeof SkillsListQuery>
