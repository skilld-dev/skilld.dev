import { z } from 'zod'

export const demoTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).refine(usage => usage.cachedInputTokens <= usage.inputTokens, {
  message: 'Cached input cannot exceed total input.',
})

export type DemoTokenUsage = z.infer<typeof demoTokenUsageSchema>

const completedTurnSchema = z.object({
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
})

/** Input already includes cached tokens. Sum completed turns without counting the cache twice. */
export function codexDemoTokenUsage(events: string): DemoTokenUsage | null {
  const turns = events.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown).filter(event => z.object({ type: z.string() }).parse(event).type === 'turn.completed').map(event => completedTurnSchema.parse(event).usage)
  if (!turns.length)
    return null
  return demoTokenUsageSchema.parse(turns.reduce((total, usage) => ({
    inputTokens: total.inputTokens + usage.input_tokens,
    cachedInputTokens: total.cachedInputTokens + usage.cached_input_tokens,
    outputTokens: total.outputTokens + usage.output_tokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }))
}
