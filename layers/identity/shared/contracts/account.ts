import { z } from 'zod'

export const identityCadenceBodySchema = z.object({
  frequency: z.enum(['weekly', 'daily', 'off']).optional(),
  dow: z.number().int().min(0).max(6).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().max(64).optional(),
})

// Opting in without an address produces a digest with nowhere to deliver.
export const identityEmailPatchBodySchema = z.object({
  digest_email: z.string().trim().toLowerCase().max(254).optional(),
  email_opt_in: z.boolean().optional(),
}).refine(
  input => !input.email_opt_in || z.string().email().safeParse(input.digest_email).success,
  { path: ['digest_email'], message: 'A valid email address is required to receive digests' },
)

export const identityMeSchema = z.object({
  id: z.number().int(),
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar: z.string().nullable(),
  digest_email: z.string().nullable(),
  email_opt_in: z.boolean(),
  digest_frequency: z.enum(['weekly', 'daily', 'off']),
  digest_dow: z.number().int().min(0).max(6).nullable(),
  digest_hour: z.number().int().min(0).max(23),
  timezone: z.string(),
  stars_synced_at: z.number().int().nullable(),
  onboarded_at: z.number().int().nullable(),
})

export const identitySubscriptionSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  source: z.string(),
  muted_until: z.number().int().nullable(),
  created_at: z.number().int(),
})

export const identitySubscriptionsSchema = z.object({
  items: z.array(identitySubscriptionSchema),
})

export const identityMutationResponseSchema = z.object({
  ok: z.literal(true),
})

export type IdentityCadenceBody = z.input<typeof identityCadenceBodySchema>
export type IdentityEmailPatchBody = z.input<typeof identityEmailPatchBodySchema>
export type IdentityMutationResponse = z.output<typeof identityMutationResponseSchema>

export interface IdentitySubscriptionRef {
  owner: string
  repo: string
}
