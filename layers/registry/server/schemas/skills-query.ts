import { z } from 'zod'

const flag = z.string().optional().transform(v => v === 'true' || v === '1')

export const SkillsListQuery = z.object({
  q: z.string().trim().toLowerCase().default(''),
  retrieval: z.enum(['hybrid', 'lexical']).default('hybrid'),
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(200).catch(60),
  // 'stars' stays the default: likes may order this surface only when the user
  // asks for it (ADR-0003).
  sort: z.enum(['stars', 'name', 'owner', 'likes']).catch('stars'),
  uniqueOwners: flag,
  maintainerRepos: flag,
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
