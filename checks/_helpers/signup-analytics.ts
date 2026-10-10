import { z } from 'zod'

const rowSchema = z.object({
  stage: z.enum(['oauth', 'discover', 'email', 'cli']),
  outcome: z.string(),
  entry: z.string(),
  choice: z.string(),
  events: z.coerce.number().finite().nonnegative(),
})

export function buildSignupQuery(since: string, until: string): string {
  const timestamp = (value: string) => new Date(value).toISOString().slice(0, 19).replace('T', ' ')
  return `SELECT blob1 AS stage, blob6 AS outcome, blob4 AS entry, blob7 AS choice, sum(_sample_interval * double3) AS events FROM skilld_web_v1 WHERE blob3 = 'signup' AND timestamp >= toDateTime('${timestamp(since)}') AND timestamp < toDateTime('${timestamp(until)}') GROUP BY stage, outcome, entry, choice ORDER BY stage, entry, outcome, choice`
}

export function summarizeSignupEvents(rows: unknown) {
  return { unit: 'events' as const, stages: z.array(rowSchema).parse(rows) }
}
