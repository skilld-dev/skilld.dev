import { z } from 'zod'

export const ASK_SKILL_RESULT_LIMIT = 5
export const ASK_SKILL_QUERY_MAX_LENGTH = 240

export const AskSkillsRequestSchema = z.object({
  query: z.string().trim().min(2).max(ASK_SKILL_QUERY_MAX_LENGTH),
})

export const AskSkillResultSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  official: z.boolean(),
  trustTier: z.string().min(1),
  path: z.string().startsWith('/gh/'),
  installCommand: z.string().min(1),
})

export const AskSkillEventSchema = z.discriminatedUnion('_tag', [
  z.object({
    _tag: z.literal('results'),
    query: z.string(),
    items: z.array(AskSkillResultSchema).max(ASK_SKILL_RESULT_LIMIT),
  }),
  z.object({
    _tag: z.literal('delta'),
    text: z.string(),
  }),
  z.object({
    _tag: z.literal('done'),
  }),
  z.object({
    _tag: z.literal('error'),
    code: z.enum(['provider_unavailable', 'stream_invalid']),
    message: z.string(),
  }),
])

export type AskSkillResult = z.infer<typeof AskSkillResultSchema>
export type AskSkillEvent = z.infer<typeof AskSkillEventSchema>

export type ParseResult<T>
  = | { _tag: 'ok', data: T }
    | { _tag: 'error', message: string }

export function parseAskSkillEvent(value: unknown): ParseResult<AskSkillEvent> {
  const parsed = AskSkillEventSchema.safeParse(value)
  return parsed.success
    ? { _tag: 'ok', data: parsed.data }
    : { _tag: 'error', message: 'Invalid Ask AI stream event.' }
}

export function parseAskSkillEventLine(line: string): ParseResult<AskSkillEvent> {
  let value: unknown
  try {
    value = JSON.parse(line)
  }
  catch {
    return { _tag: 'error', message: 'Ask AI returned malformed JSON.' }
  }
  return parseAskSkillEvent(value)
}

export function encodeAskSkillEvent(event: AskSkillEvent): string {
  return `${JSON.stringify(event)}\n`
}

export function consumeNdjsonChunk(buffer: string, chunk: string): { lines: string[], rest: string } {
  const parts = `${buffer}${chunk}`.split('\n')
  const rest = parts.pop() ?? ''
  return {
    lines: parts.map(line => line.endsWith('\r') ? line.slice(0, -1) : line).filter(Boolean),
    rest,
  }
}

const WorkersAiTextDeltaSchema = z.object({
  choices: z.tuple([
    z.object({
      delta: z.object({ content: z.string() }),
    }),
  ]).rest(z.unknown()),
})

export function extractWorkersAiTextDelta(value: unknown): string | null {
  const parsed = WorkersAiTextDeltaSchema.safeParse(value)
  return parsed.success ? parsed.data.choices[0].delta.content : null
}
