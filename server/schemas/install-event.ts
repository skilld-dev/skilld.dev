import { z } from 'zod'

export const InstallEventInput = z.object({
  surface: z.string().min(1).max(64),
  // `repo` was added on 2026-09-04 for the homepage hero, which installs a
  // whole repository rather than one skill. It stores the repo in `name`.
  kind: z.enum(['skill', 'collection', 'repo']),
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
