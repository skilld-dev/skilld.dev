import { z } from 'zod'

export const InstallEventInput = z.object({
  surface: z.string().min(1).max(64),
  kind: z.enum(['skill', 'collection']),
  owner: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  handle: z.string().max(128).optional(),
  slug: z.string().max(128).optional(),
  // Written only by the retired agent setup picker; kept for the stored column.
  agent: z.string().max(64).optional(),
  // `run` and `install` are the live values. The first three are historical.
  mode: z.enum(['project', 'global', 'once', 'run', 'install']).optional(),
})

export type InstallEventInput = z.infer<typeof InstallEventInput>
