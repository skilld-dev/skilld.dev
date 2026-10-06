/**
 * Task search: the search box's opt-in answer for a sentence.
 *
 * A model writes a few searches for the task, the registry's own search runs
 * them, and the model keeps the Skills that fit. Everything in this file is
 * pure: the model call and the search are injected, so the loop runs in tests
 * against a scripted model.
 *
 * The model only chooses among Skills the searches returned. Every ref it
 * answers is snapped to one of those results, and the rest are dropped, so it
 * can reorder and filter the registry but never add to it.
 *
 * Measured offline on 2026-10-06 over 20 sentences (~/notes, search stage 2
 * eval): 2 turns per question, about 6k input and 220 output tokens, $0.0007,
 * and a median of 5.2s with reasoning off.
 */

/**
 * OpenAI GPT-6 Luna, brokered through the Workers AI binding. It bills against
 * the account's AI Gateway credits, not the Workers AI allowance.
 */
export const TASK_SEARCH_MODEL = 'openai/gpt-6-luna'

/** Bump when the prompt, the tool, or the parser changes, so cached answers expire. */
export const TASK_SEARCH_PROMPT_VERSION = 1

/** Model calls per question, the answer included. The eval needed 2. */
export const TASK_SEARCH_MAX_TURNS = 3

/**
 * Results per search. The eval's memory leak question found its Skill at
 * rank 7 or 8 of 10, and one run in 3 missed it.
 */
export const TASK_SEARCH_RESULTS_PER_QUERY = 15

export const TASK_SEARCH_MAX_SKILLS = 6

const MAX_SEARCHES_PER_TURN = 4
const MAX_QUERY_CHARS = 200
const MAX_DESCRIPTION_CHARS = 280
const MAX_COMPLETION_TOKENS = 800

/**
 * Micro-dollars per token: GPT-6 Luna list prices on 2026-10-06, $0.10 per
 * million input, $0.01 cached, $0.50 output. AI Gateway adds 5% when credits
 * are bought, which this does not count.
 */
const PRICE_MICROS = { input: 0.1, cachedInput: 0.01, output: 0.5 } as const

/** One search result as the model reads it. `ref` is ready to answer with. */
export interface TaskSearchSkill {
  ref: string
  description: string | null
  stars: number
}

export interface ModelToolCall {
  id: string
  type: 'function'
  function: { name: string, arguments: string }
}

export type TaskSearchMessage
  = | { role: 'system' | 'user', content: string }
    | { role: 'assistant', content: string | null, tool_calls: ModelToolCall[] }
    | { role: 'tool', tool_call_id: string, content: string }

/** One Chat Completions request, as the Workers AI binding takes it for `openai/*`. */
export interface TaskSearchRequest {
  messages: TaskSearchMessage[]
  tools: typeof TOOLS
  tool_choice: 'auto' | 'none'
  response_format: typeof ANSWER_FORMAT
  max_completion_tokens: number
  /** Chat Completions refuses function tools with reasoning on this model. */
  reasoning_effort: 'none'
}

export interface TaskSearchUsage {
  inputTokens: number
  cachedTokens: number
  outputTokens: number
}

export interface TaskSearchDeps {
  /** One model call. Resolves with the raw reply, untrusted. */
  model: (request: TaskSearchRequest) => Promise<unknown>
  /** The registry's search, at most {@link TASK_SEARCH_RESULTS_PER_QUERY} results. */
  search: (query: string) => Promise<TaskSearchSkill[]>
}

interface RunStats {
  turns: number
  searches: number
  usage: TaskSearchUsage
}

export type TaskSearchResult
  = | ({ _tag: 'found', refs: string[], dropped: number } & RunStats)
    | ({ _tag: 'none', dropped: number } & RunStats)
    | ({ _tag: 'failed', reason: 'model-error' | 'invalid-response', error?: unknown } & RunStats)

const SEARCH_TOOL_NAME = 'search_skills'

const TOOLS = [{
  type: 'function',
  function: {
    name: SEARCH_TOOL_NAME,
    description: `Search the skilld.dev registry for agent Skills, by meaning and by keyword. Returns up to ${TASK_SEARCH_RESULTS_PER_QUERY} Skills, each with its ref, description, and GitHub stars.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the Skill should help with, such as "nuxt seo" or "database migrations"' },
      },
      required: ['query'],
    },
  },
}] as const

const ANSWER_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'task_search_answer',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { refs: { type: 'array', items: { type: 'string' } } },
      required: ['refs'],
    },
  },
} as const

export function taskSearchSystemPrompt(): string {
  return `You find agent Skills on skilld.dev for a developer's task.
A Skill is a SKILL.md file of instructions that a coding agent reads. The developer typed a sentence into the search box.

Use ${SEARCH_TOOL_NAME} to find candidates. Rewrite the sentence into short topical queries, and try 2 or 3 different angles in parallel (the technology, the problem, the activity).
Read descriptions critically. A Skill for another language or runtime is not a match, even if it shares words.
You have at most ${TASK_SEARCH_MAX_TURNS} model turns, including the final answer.

Final answer: JSON only. Return up to ${TASK_SEARCH_MAX_SKILLS} refs, best first. Each ref must be exactly the "ref" value of a search result.
Never return a ref you did not see in a search result. If nothing fits the task, return an empty list.`
}

function request(messages: TaskSearchMessage[], last: boolean): TaskSearchRequest {
  return {
    messages: [...messages],
    tools: TOOLS,
    tool_choice: last ? 'none' : 'auto',
    response_format: ANSWER_FORMAT,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    reasoning_effort: 'none',
  }
}

const EMPTY_USAGE: TaskSearchUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function readUsage(reply: unknown): TaskSearchUsage {
  const usage = (reply as { usage?: Record<string, unknown> } | null)?.usage
  if (typeof usage !== 'object' || usage === null)
    return EMPTY_USAGE
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined
  return {
    inputTokens: count(usage.prompt_tokens),
    cachedTokens: count(details?.cached_tokens),
    outputTokens: count(usage.completion_tokens),
  }
}

function addUsage(a: TaskSearchUsage, b: TaskSearchUsage): TaskSearchUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

/** What one model call might cost, rounded up to a whole micro-dollar. */
export function taskSearchCostMicros(usage: TaskSearchUsage): number {
  const fresh = Math.max(0, usage.inputTokens - usage.cachedTokens)
  return Math.ceil(fresh * PRICE_MICROS.input + usage.cachedTokens * PRICE_MICROS.cachedInput + usage.outputTokens * PRICE_MICROS.output)
}

type ModelTurn
  = | { _tag: 'searches', calls: ModelToolCall[] }
    | { _tag: 'answer', refs: unknown[] }
    | { _tag: 'invalid' }

function readToolCall(value: unknown): ModelToolCall | null {
  if (typeof value !== 'object' || value === null)
    return null
  const { id, function: fn } = value as { id?: unknown, function?: { name?: unknown, arguments?: unknown } }
  if (typeof id !== 'string' || typeof fn?.name !== 'string')
    return null
  return { id, type: 'function', function: { name: fn.name, arguments: typeof fn.arguments === 'string' ? fn.arguments : '' } }
}

/** Parse an untrusted Chat Completions reply into searches, an answer, or neither. */
function readTurn(reply: unknown): ModelTurn {
  const message = (reply as { choices?: { message?: Record<string, unknown> }[] } | null)?.choices?.[0]?.message
  if (typeof message !== 'object' || message === null)
    return { _tag: 'invalid' }
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    const calls = message.tool_calls.map(readToolCall)
    return calls.every(call => call !== null) ? { _tag: 'searches', calls: calls as ModelToolCall[] } : { _tag: 'invalid' }
  }
  if (typeof message.content !== 'string')
    return { _tag: 'invalid' }
  try {
    const parsed: unknown = JSON.parse(message.content)
    const refs = (parsed as { refs?: unknown } | null)?.refs
    return Array.isArray(refs) ? { _tag: 'answer', refs } : { _tag: 'invalid' }
  }
  catch {
    // Prose instead of the JSON the response format asks for: the caller
    // reports an invalid response, which is the whole answer to it.
    return { _tag: 'invalid' }
  }
}

function toolText(skills: TaskSearchSkill[]): string {
  return JSON.stringify({
    items: skills.map(skill => ({
      ref: skill.ref,
      description: skill.description?.slice(0, MAX_DESCRIPTION_CHARS) ?? null,
      stars: skill.stars,
    })),
  })
}

function searchQuery(call: ModelToolCall): string | null {
  try {
    const query = (JSON.parse(call.function.arguments) as { query?: unknown } | null)?.query
    if (typeof query !== 'string')
      return null
    const trimmed = query.trim()
    return trimmed && trimmed.length <= MAX_QUERY_CHARS ? trimmed : null
  }
  catch {
    // Arguments that are not JSON get the same reply as a missing query.
    return null
  }
}

/**
 * Run one turn's searches. Every call id gets a reply, because the next
 * request is refused while any call is left unanswered.
 */
async function runSearches(
  deps: TaskSearchDeps,
  calls: ModelToolCall[],
  seen: Set<string>,
): Promise<{ replies: TaskSearchMessage[], searches: number }> {
  let budget = MAX_SEARCHES_PER_TURN
  const replies = await Promise.all(calls.map(async (call): Promise<TaskSearchMessage> => {
    const reply = (content: string): TaskSearchMessage => ({ role: 'tool', tool_call_id: call.id, content })
    if (call.function.name !== SEARCH_TOOL_NAME)
      return reply(`Unknown tool: ${call.function.name}. Use ${SEARCH_TOOL_NAME}.`)
    const query = searchQuery(call)
    if (!query)
      return reply(`Invalid arguments: query must be 1 to ${MAX_QUERY_CHARS} characters.`)
    if (budget <= 0)
      return reply(`Search skipped: at most ${MAX_SEARCHES_PER_TURN} searches a turn.`)
    budget--
    const skills = await deps.search(query)
    skills.forEach(skill => seen.add(skill.ref))
    return reply(toolText(skills))
  }))
  return { replies, searches: MAX_SEARCHES_PER_TURN - budget }
}

function normaliseRef(value: string): string {
  return value.trim().toLowerCase().replace(/^[@/]+|\/+$/g, '')
}

/**
 * Snap the model's refs to refs the searches returned, best first, once each.
 *
 * The model assembles a ref by copying it, and it slips when a Skill's name
 * repeats its Repository's: the eval saw `owner/name` for
 * `owner/name/name` and `nuxt/ui/nuxt-ui/nuxt-ui` for `nuxt/ui/nuxt-ui`. A
 * slipped ref is repaired by owner and Skill name when exactly one result
 * matches. Anything else is dropped.
 */
export function snapRefs(returned: readonly unknown[], seen: Iterable<string>, max = TASK_SEARCH_MAX_SKILLS): string[] {
  const known = new Map<string, string>()
  for (const ref of seen)
    known.set(ref.toLowerCase(), ref)
  const snapped: string[] = []
  for (const value of returned) {
    if (snapped.length >= max)
      break
    if (typeof value !== 'string')
      continue
    const ref = normaliseRef(value)
    const exact = known.get(ref)
    const match = exact ?? repairRef(ref, known)
    if (match && !snapped.includes(match))
      snapped.push(match)
  }
  return snapped
}

function repairRef(ref: string, known: Map<string, string>): string | null {
  const segments = ref.split('/').filter(Boolean)
  if (segments.length < 2)
    return null
  const owner = segments[0]
  const name = segments.at(-1)
  const candidates = [...known.entries()].filter(([key]) => {
    const parts = key.split('/')
    return parts[0] === owner && parts.at(-1) === name
  })
  return candidates.length === 1 ? candidates[0]![1] : null
}

/**
 * Answer one sentence. Expected failures, a model that errors or replies
 * with something unusable, come back as values. A failing search is not
 * expected here and propagates.
 */
export async function runTaskSearch(deps: TaskSearchDeps, question: string): Promise<TaskSearchResult> {
  const messages: TaskSearchMessage[] = [
    { role: 'system', content: taskSearchSystemPrompt() },
    { role: 'user', content: question },
  ]
  const seen = new Set<string>()
  let usage = EMPTY_USAGE
  let searches = 0

  for (let turn = 1; turn <= TASK_SEARCH_MAX_TURNS; turn++) {
    const stats = () => ({ turns: turn, searches, usage })
    const last = turn === TASK_SEARCH_MAX_TURNS
    const reply = await deps.model(request(messages, last)).then(
      value => ({ _tag: 'ok' as const, value }),
      (error: unknown) => ({ _tag: 'error' as const, error }),
    )
    if (reply._tag === 'error')
      return { _tag: 'failed', reason: 'model-error', error: reply.error, ...stats() }
    usage = addUsage(usage, readUsage(reply.value))

    const parsed = readTurn(reply.value)
    if (parsed._tag === 'invalid' || (parsed._tag === 'searches' && last))
      return { _tag: 'failed', reason: 'invalid-response', ...stats() }

    if (parsed._tag === 'searches') {
      messages.push({ role: 'assistant', content: null, tool_calls: parsed.calls })
      const ran = await runSearches(deps, parsed.calls, seen)
      searches += ran.searches
      messages.push(...ran.replies)
      continue
    }

    const refs = snapRefs(parsed.refs, seen)
    const offered = new Set(parsed.refs.filter((ref): ref is string => typeof ref === 'string').map(normaliseRef)).size
    const dropped = Math.max(0, Math.min(offered, TASK_SEARCH_MAX_SKILLS) - refs.length)
    return refs.length
      ? { _tag: 'found', refs, dropped, ...stats() }
      : { _tag: 'none', dropped, ...stats() }
  }
  // The last turn always returns above: tool_choice none forces an answer or an invalid reply.
  return { _tag: 'failed', reason: 'invalid-response', turns: TASK_SEARCH_MAX_TURNS, searches, usage }
}
