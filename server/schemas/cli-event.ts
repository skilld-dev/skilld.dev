import { z } from 'zod'

export const CliEventInput = z.object({
  event: z.enum(['install', 'install-failed', 'update', 'audit-warn', 'audit-fail', 'audit-blocked', 'auth-flow', 'pull-checklist']),
  surface: z.string().min(1).max(32),
  sourceKind: z.enum(['npm', 'gh', 'crate', 'collection', 'curator']).optional(),
  slug: z.string().max(256).optional(),
  cliVersion: z.string().max(32),
  agent: z.string().max(32).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  userId: z.number().int().optional(),
})

export type CliEventInput = z.infer<typeof CliEventInput>
