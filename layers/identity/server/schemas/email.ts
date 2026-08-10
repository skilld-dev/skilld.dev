import { z } from 'zod'

export const EmailVerifyRequestInput = z.object({
  digest_email: z.string().trim().toLowerCase().email().max(254),
})

export const EmailVerifyQuery = z.object({
  t: z.string().min(1),
})

export type EmailVerifyRequestInput = z.infer<typeof EmailVerifyRequestInput>
