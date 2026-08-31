import { z } from 'zod'

// Either email needs a deliverable address.
export const identityEmailPatchBodySchema = z.object({
  // A blank address parses to "unchanged", so a lone PATCH can never null the
  // stored address of an opted-in caller. Only a real address reaches the
  // handler.
  digest_email: z.string().trim().toLowerCase().max(254).transform(value => value === '' ? undefined : value).optional(),
  email_opt_in: z.boolean().optional(),
  /**
   * The weekly email, stored inverted as `weekly_opt_out`.
   *
   * The API speaks opt-in because that is what the switch in the UI means. The
   * column is the opposite so a new account defaults to receiving it without a
   * backfill.
   */
  weekly_opt_in: z.boolean().optional(),
}).refine(
  input => !(input.email_opt_in || input.weekly_opt_in)
    || z.string().email().safeParse(input.digest_email).success,
  { path: ['digest_email'], message: 'Add a valid email address to receive emails' },
)

export const identityMeSchema = z.object({
  id: z.number().int(),
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar: z.string().nullable(),
  digest_email: z.string().nullable(),
  email_opt_in: z.boolean(),
  weekly_opt_in: z.boolean(),
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

export type IdentityEmailPatchBody = z.input<typeof identityEmailPatchBodySchema>
export type IdentityMutationResponse = z.output<typeof identityMutationResponseSchema>

export interface IdentitySubscriptionRef {
  owner: string
  repo: string
}
