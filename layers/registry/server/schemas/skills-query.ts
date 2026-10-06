import { z } from 'zod'
import { classifySearchQuery, MAX_SEARCH_QUERY_LENGTH } from '#shared/skill-search-query'

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

/** The search box. `q` is cut to the box's limit rather than rejected. */
export const SkillBoxSearchQuery = z.object({
  q: z.string().default('').transform(value => value.slice(0, MAX_SEARCH_QUERY_LENGTH)),
  limit: z.coerce.number().int().min(1).max(20).catch(7),
})

export type SkillBoxSearchQuery = z.infer<typeof SkillBoxSearchQuery>

/**
 * Task search answers a sentence, the one query kind the search box offers it
 * for. `q` arrives normalised, so the answer cache key is one spelling.
 */
export const TaskSearchBody = z.object({
  q: z.string().transform((value, ctx) => {
    const query = classifySearchQuery(value.slice(0, MAX_SEARCH_QUERY_LENGTH))
    if (query._tag !== 'intent') {
      ctx.addIssue({ code: 'custom', message: 'Task search answers a sentence of two or more words.' })
      return z.NEVER
    }
    return query.text
  }),
})

export type TaskSearchBody = z.infer<typeof TaskSearchBody>
