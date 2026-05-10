import { z } from 'zod'

export const EmailPatchInput = z.object({
  digest_email: z.string().trim().max(254).optional(),
  email_opt_in: z.boolean().optional(),
})

export const EmailVerifyRequestInput = z.object({
  digest_email: z.string().trim().toLowerCase().email().max(254),
})

export const EmailVerifyQuery = z.object({
  t: z.string().min(1),
})

export type EmailPatchInput = z.infer<typeof EmailPatchInput>
export type EmailVerifyRequestInput = z.infer<typeof EmailVerifyRequestInput>
