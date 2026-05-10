import { z } from 'zod'

export const CadenceInput = z.object({
  frequency: z.enum(['weekly', 'daily', 'off']).optional(),
  dow: z.number().int().min(0).max(6).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().max(64).optional(),
})

export type CadenceInput = z.infer<typeof CadenceInput>
