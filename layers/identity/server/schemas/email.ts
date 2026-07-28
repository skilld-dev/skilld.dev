import { z } from 'zod'

// Opting in without an address produces a user the digest can claim a window
// for and never deliver to, so every window records a delivery failure the
// operator cannot act on. The address is therefore part of opting in.
export const EmailPatchInput = z.object({
  digest_email: z.string().trim().toLowerCase().max(254).optional(),
  email_opt_in: z.boolean().optional(),
}).refine(
  input => !input.email_opt_in || z.string().email().safeParse(input.digest_email).success,
  { path: ['digest_email'], message: 'A valid email address is required to receive digests' },
)

export const EmailVerifyRequestInput = z.object({
  digest_email: z.string().trim().toLowerCase().email().max(254),
})

export const EmailVerifyQuery = z.object({
  t: z.string().min(1),
})

export type EmailPatchInput = z.infer<typeof EmailPatchInput>
export type EmailVerifyRequestInput = z.infer<typeof EmailVerifyRequestInput>
