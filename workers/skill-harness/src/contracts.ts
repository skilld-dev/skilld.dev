import { z } from 'zod'

export const MAX_REQUEST_BYTES = 512 * 1024
export const MAX_RESULT_BYTES = 1024 * 1024
export const MAX_MODEL_CALLS = 64
export const JOB_TIMEOUT_MS = 15 * 60 * 1000

const skillPath = z.string().max(200).refine(path =>
  path === 'SKILL.md'
  || (/^references\/(?:[\w-]+\/)*[\w.-]+\.md$/i.test(path)
    && path.split('/').every(part => part !== '.' && part !== '..')),
)

const filesSchema = z.array(z.object({
  path: skillPath,
  content: z.string().max(64 * 1024),
}).strict()).min(1).max(9).refine(files =>
  files.some(file => file.path === 'SKILL.md')
  && new Set(files.map(file => file.path)).size === files.length,
)

const inputSchema = z.object({
  spec: z.string().regex(/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+@\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  currentSkill: filesSchema,
}).strict()

const reportSchema = z.object({
  _tag: z.literal('Unavailable'),
  reason: z.string().max(2000),
  warnings: z.array(z.string().max(2000)).max(512),
})

const resultSchema = z.union([
  z.object({
    _tag: z.literal('Ok'),
    files: filesSchema,
    generation: reportSchema,
    reviewReport: reportSchema,
    review: z.object({
      summary: z.string().max(4000),
      findings: z.array(z.object({
        level: z.enum(['error', 'warning', 'note']),
        path: z.string().max(200),
        message: z.string().max(4000),
        fix: z.string().max(4000),
      })).max(128),
    }),
    sourceAttempts: z.array(z.object({ source: z.string(), status: z.enum(['used', 'skipped']), reason: z.string().optional() })).max(128),
    repairAttempts: z.number().int().min(0).max(1),
    elapsedMs: z.number().nonnegative(),
  }),
  z.object({
    _tag: z.literal('Err'),
    code: z.literal('REVIEW_REJECTED'),
    detail: z.string().max(8000),
    candidateFiles: filesSchema,
    generation: reportSchema,
    reviewReport: reportSchema,
    review: z.object({
      summary: z.string().max(4000),
      findings: z.array(z.object({
        level: z.enum(['error', 'warning', 'note']),
        path: z.string().max(200),
        message: z.string().max(4000),
        fix: z.string().max(4000),
      })).max(128),
    }),
    sourceAttempts: z.array(z.object({ source: z.string(), status: z.enum(['used', 'skipped']), reason: z.string().optional() })).max(128),
    repairAttempts: z.literal(1),
    elapsedMs: z.number().nonnegative(),
  }),
  z.object({
    _tag: z.literal('Err'),
    code: z.enum(['GENERATION_FAILED', 'REVIEW_FAILED', 'RUNNER_FAILED', 'DEADLINE_EXCEEDED', 'CONTAINER_LOST', 'INVALID_OUTPUT']),
    detail: z.string().max(8000),
    generation: reportSchema.optional(),
    reviewReport: reportSchema.optional(),
    elapsedMs: z.number().nonnegative(),
  }),
])

export type ProofInput = z.infer<typeof inputSchema>
export type ProofResult = z.infer<typeof resultSchema>
export type ProofState
  = | { _tag: 'Running', startedAt: number, modelCalls: number }
    | { _tag: 'Finished', result: ProofResult, modelCalls: number }

export function parseProofInput(input: unknown) {
  const parsed = inputSchema.safeParse(input)
  return parsed.success
    ? { _tag: 'Ok' as const, value: parsed.data }
    : { _tag: 'Err' as const, code: 'INVALID_INPUT' as const }
}

export function parseProofResult(input: unknown) {
  const parsed = resultSchema.safeParse(input)
  return parsed.success
    ? { _tag: 'Ok' as const, value: parsed.data }
    : { _tag: 'Err' as const, code: 'INVALID_OUTPUT' as const }
}

export async function readBoundedBody(request: Request | Response, limit: number): Promise<string | undefined> {
  if (!request.body)
    return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const next = await reader.read()
    if (next.done)
      break
    bytes += next.value.byteLength
    if (bytes > limit) {
      await reader.cancel()
      return undefined
    }
    chunks.push(next.value)
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export function parseJson(body: string) {
  try {
    return { _tag: 'Ok' as const, value: JSON.parse(body) as unknown }
  }
  catch {
    return { _tag: 'Err' as const, code: 'INVALID_JSON' as const }
  }
}
