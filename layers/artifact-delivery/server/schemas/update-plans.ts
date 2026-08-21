import { z } from 'zod'
import { COMMIT_SHA_PATTERN } from './contracts'

const githubOwnerSchema = z.string()
  .min(1)
  .max(39)
  .regex(/^[a-z0-9][a-z0-9-]{0,38}$/i)

const githubRepositorySchema = z.string()
  .min(1)
  .max(100)
  .regex(/^[\w.-]+$/)
  .refine(value => value !== '.' && value !== '..' && !value.endsWith('.git'))

const comparisonIdSchema = z.string()
  .min(1)
  .max(200)
  .regex(/^[^\W_][\w./@:-]*$/)

export const updatePlanComparisonSchema = z.object({
  id: comparisonIdSchema,
  owner: githubOwnerSchema,
  repository: githubRepositorySchema,
  baseSha: z.string().regex(COMMIT_SHA_PATTERN),
  headSha: z.string().regex(COMMIT_SHA_PATTERN),
}).strict()

export const updatePlansRequestSchema = z.object({
  comparisons: z.array(updatePlanComparisonSchema).min(1).max(50),
}).strict()

const updatePlanCommitSchema = z.object({
  sha: z.string().regex(COMMIT_SHA_PATTERN),
  subject: z.string().min(1).max(500),
  timestamp: z.string().datetime(),
  author: z.object({
    name: z.string().min(1).max(200),
    login: z.string().min(1).max(100).nullable(),
  }).strict(),
}).strict()

const updatePlanIdentitySchema = updatePlanComparisonSchema.shape

const updatePlanReadySchema = z.object({
  _tag: z.literal('ready'),
  ...updatePlanIdentitySchema,
  relation: z.enum(['ahead', 'behind', 'diverged', 'identical']),
  commits: z.array(updatePlanCommitSchema).max(500),
  total: z.number().int().nonnegative().safe(),
  truncated: z.boolean(),
  compareUrl: z.string().url().max(2048),
}).strict()

const updatePlanNotFoundSchema = z.object({
  _tag: z.literal('not_found'),
  ...updatePlanIdentitySchema,
}).strict()

const updatePlanInvalidComparisonSchema = z.object({
  _tag: z.literal('invalid_comparison'),
  ...updatePlanIdentitySchema,
}).strict()

const updatePlanRateLimitedSchema = z.object({
  _tag: z.literal('rate_limited'),
  ...updatePlanIdentitySchema,
  retryAfterSeconds: z.number().int().nonnegative().max(604_800).nullable(),
  resetAt: z.string().datetime().nullable(),
}).strict()

const updatePlanProviderFailureSchema = z.object({
  _tag: z.literal('provider_failure'),
  ...updatePlanIdentitySchema,
  status: z.number().int().min(100).max(599).nullable(),
}).strict()

export const updatePlanResultSchema = z.discriminatedUnion('_tag', [
  updatePlanReadySchema,
  updatePlanNotFoundSchema,
  updatePlanInvalidComparisonSchema,
  updatePlanRateLimitedSchema,
  updatePlanProviderFailureSchema,
])

export const updatePlansResponseSchema = z.object({
  results: z.array(updatePlanResultSchema).max(50),
}).strict()

export type UpdatePlanComparison = z.infer<typeof updatePlanComparisonSchema>
export type UpdatePlanResult = z.infer<typeof updatePlanResultSchema>
