import { z } from 'zod'

export const InstallEventInput = z.object({
  surface: z.string().min(1).max(64),
  kind: z.enum(['skill', 'collection']),
  owner: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  handle: z.string().max(128).optional(),
  slug: z.string().max(128).optional(),
})

export type InstallEventInput = z.infer<typeof InstallEventInput>
