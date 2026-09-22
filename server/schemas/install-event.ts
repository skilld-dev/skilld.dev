import { z } from 'zod'

/**
 * Body of `POST /api/events/install`: one copy of a printed command.
 *
 * Nothing here names a person. The site sends only what it already printed on
 * the page. The old `project`, `global`, `once`, and `agent` values died with
 * the `install_events` table, so the enum holds the two live grammars.
 */
export const InstallEventInput = z.object({
  surface: z.string().min(1).max(64),
  // `repo` is what the homepage hero copies: a whole repository rather than
  // one Skill. It stores the repository in `name`.
  kind: z.enum(['skill', 'collection', 'repo']),
  owner: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
  handle: z.string().max(128).optional(),
  slug: z.string().max(128).optional(),
  mode: z.enum(['run', 'install']),
// Strict, so a field the endpoint never asked for is a 400 rather than a
// value that reaches the data point by accident.
}).strict()

export type InstallEventInput = z.infer<typeof InstallEventInput>
