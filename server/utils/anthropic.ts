/**
 * Two backends for batch skill-derivation jobs:
 *
 *  1. `callHaikuApi`  — direct fetch to api.anthropic.com. Needs
 *                       ANTHROPIC_API_KEY. Supports prompt caching on the
 *                       system prompt.
 *  2. `callHaikuCli`  — shells out to `claude -p` using the local user's
 *                       already-authenticated session. No API key. Perfect
 *                       for one-off prototyping from a dev machine.
 *
 * `callHaiku` is a convenience that picks the CLI path when no key is given.
 */

import { spawn } from 'node:child_process'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type HaikuModel = 'claude-haiku-4-5-20251001'

export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ClaudeTextResponse {
  text: string
  usage: ClaudeUsage
  stopReason: string | null
}

interface RawMessagesResponse {
  content: { type: string, text?: string }[]
  usage: ClaudeUsage
  stop_reason: string | null
}

export interface CallHaikuOpts {
  systemPrompt: string
  userPrompt: string
  /** When set, uses direct API. When absent, falls back to `claude -p`. */
  apiKey?: string | undefined
  model?: HaikuModel
  maxTokens?: number
  /** If true, wrap the system prompt in a cache_control block (5-min TTL). API mode only. */
  cacheSystem?: boolean
  /** JSON Schema — CLI-only — when set, response is schema-validated. */
  jsonSchema?: Record<string, unknown>
}

export async function callHaiku(opts: CallHaikuOpts): Promise<ClaudeTextResponse> {
  if (opts.apiKey)
    return callHaikuApi(opts as CallHaikuOpts & { apiKey: string })
  return callHaikuCli(opts)
}

export async function callHaikuApi(opts: CallHaikuOpts & { apiKey: string }): Promise<ClaudeTextResponse> {
  const {
    systemPrompt,
    userPrompt,
    apiKey,
    model = 'claude-haiku-4-5-20251001',
    maxTokens = 1024,
    cacheSystem = true,
  } = opts

  const system = cacheSystem
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 500)}`)
  }

  const data = await res.json() as RawMessagesResponse
  const text = data.content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text!)
    .join('')

  return { text, usage: data.usage, stopReason: data.stop_reason }
}

/**
 * Shell out to `claude -p`. Uses --bare to skip hooks/memory/plugins,
 * --tools "" to prevent tool use (we want pure text), and --output-format json
 * so we can read structured usage info. Returns the same shape as the API call.
 */
export async function callHaikuCli(opts: CallHaikuOpts): Promise<ClaudeTextResponse> {
  const { systemPrompt, userPrompt, model = 'claude-haiku-4-5-20251001' } = opts

  // CC wraps/injects its own framing around --system-prompt, so Haiku tends
  // to stay conversational. For batch jobs we fold the system prompt into the
  // user message as an explicit instructions block — this is the most reliable
  // way to get structured output via the CLI path.
  const foldedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`
  const args = [
    '-p',
    '--model',
    model,
    '--tools',
    '',
    '--output-format',
    'json',
    '--permission-mode',
    'bypassPermissions',
    '--disable-slash-commands',
    '--no-session-persistence',
  ]
  if (opts.jsonSchema)
    args.push('--json-schema', JSON.stringify(opts.jsonSchema))
  args.push(foldedPrompt)

  const { stdout, stderr, code } = await new Promise<{ stdout: string, stderr: string, code: number | null }>((resolve, reject) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => stdout += d.toString())
    child.stderr.on('data', d => stderr += d.toString())
    child.on('close', c => resolve({ stdout, stderr, code: c }))
    child.on('error', reject)
  })

  if (code !== 0)
    throw new Error(`claude -p exited ${code}: ${stdout.slice(0, 400)} ${stderr.slice(0, 400)}`)

  // --output-format json returns { type, subtype, result, usage, total_cost_usd, ... }
  const parsed = JSON.parse(stdout) as {
    result?: string
    usage?: { input_tokens?: number, output_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number }
    is_error?: boolean
    subtype?: string
  }

  if (parsed.is_error)
    throw new Error(`claude -p error: ${parsed.subtype ?? 'unknown'}`)

  return {
    text: parsed.result ?? '',
    usage: {
      input_tokens: parsed.usage?.input_tokens ?? 0,
      output_tokens: parsed.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: parsed.usage?.cache_creation_input_tokens,
      cache_read_input_tokens: parsed.usage?.cache_read_input_tokens,
    },
    stopReason: null,
  }
}

/** Pull JSON out of a Claude response that may have extra prose around a code fence. */
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\n([\s\S]*?)```/)
  const raw = fence ? fence[1]! : text
  const start = raw.indexOf('{')
  const arrStart = raw.indexOf('[')
  const firstBrace = start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart)
  if (firstBrace === -1)
    return null
  const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  const slice = raw.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(slice) as T
  }
  catch {
    return null
  }
}
