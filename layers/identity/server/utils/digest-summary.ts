// Per-user digest summaries via the Workers AI binding. No gateway, no
// API key — `env.AI.run(model, ...)` is authenticated implicitly by the
// Worker→Cloudflare relationship. Failure mode: caller falls back to the
// no-summary template — never block the send.
//
// Workers AI has no Anthropic-style prompt caching; the cost per call is
// low enough that re-paying the full prompt each week is fine.

// Workers AI Anthropic-partner shape: top-level `system` (string), `messages`
// with role 'user'|'assistant', max_tokens required. Response is the raw
// Anthropic message: `content` is an array of typed blocks; we read the
// first text block.
export interface AiBinding {
  run: (model: string, input: {
    messages: Array<{ role: 'user' | 'assistant', content: string }>
    max_tokens: number
    system?: string
    thinking?: { type: 'disabled' }
  }) => Promise<unknown>
}

// Anthropic Haiku 5.5 brokered through Workers AI. The binding handles auth;
// no Anthropic key or gateway token needed. Swap to a llama/qwen if cost or
// latency need to drop later — caller doesn't care which model produced
// `response`.
const MODEL = 'anthropic/claude-haiku-5.5'

export interface SubscriptionContext {
  owner: string
  repo: string
  skills: Array<{
    name: string
    description: string | null
    changeCount: number
  }>
}

export interface RepoChange {
  owner: string
  repo: string
  totalChangeCount: number
  skills: Array<{
    name: string
    changeCount: number
    commitMessages: string[]
  }>
  // First ~3000 chars of unified SKILL.md diff (or empty if SHA-only).
  diffExcerpt: string
}

export interface SkillSummary {
  owner: string
  repo: string
  sentence: string
}

export interface SummariseInput {
  ai: AiBinding
  subscriptions: SubscriptionContext[]
  changes: RepoChange[]
}

export type SummariseResult
  = {
    _tag: 'summarized'
    summaries: SkillSummary[]
    usage: { inputTokens: number, outputTokens: number } | null
  }
  | {
    _tag: 'fallback'
    reason: 'no_changes' | 'binding_missing' | 'paused' | 'provider_failure' | 'empty_response' | 'invalid_response'
    error?: string
  }

// The digest delivery only needs the changes, so the binding and the pause
// switch are bound once by the caller.
export type DigestSummariser = (input: Omit<SummariseInput, 'ai'>) => Promise<SummariseResult>

// Single place that decides whether a digest run talks to the model. When the
// summary is paused, or the binding is missing, the caller gets a fallback and
// the provider is never called.
export function resolveDigestSummariser(input: {
  paused: boolean
  ai: AiBinding | undefined
}): DigestSummariser {
  if (input.paused)
    return async () => ({ _tag: 'fallback', reason: 'paused' })
  const ai = input.ai
  if (!ai)
    return async () => ({ _tag: 'fallback', reason: 'binding_missing' })
  return async changes => summariseChanges({ ai, ...changes })
}

export async function summariseChanges(input: SummariseInput): Promise<SummariseResult> {
  if (!input.changes.length)
    return { _tag: 'fallback', reason: 'no_changes' }

  const subs = [...input.subscriptions].sort((a, b) =>
    `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`))
  const subBlock = subs
    .map((subscription) => {
      const skills = subscription.skills
        .map(skill =>
          `${skill.name} (${skill.changeCount} change${skill.changeCount === 1 ? '' : 's'})${
            skill.description ? `: ${skill.description}` : ''
          }`)
        .join('; ')
      return `- ${subscription.owner}/${subscription.repo}: ${skills}`
    })
    .join('\n')

  const systemPrompt = `You write one-sentence summaries of changes to AI agent skills for a change digest email.

For each repo with changes, return one sentence (max ~20 words) describing what changed and why a developer using this skill might care. Be concrete; no marketing fluff.

Subscriptions for this user:
${subBlock}

Output JSON only, no prose, with this exact shape:
{"summaries":[{"owner":"...","repo":"...","sentence":"..."}]}`

  const changesBlock = input.changes.map((c) => {
    const skills = c.skills.map((skill) => {
      const commits = skill.commitMessages.slice(0, 20).map(m => `    - ${m}`).join('\n')
      return `  - ${skill.name}: ${skill.changeCount} change${skill.changeCount === 1 ? '' : 's'}\n${commits || '    (no commit messages)'}`
    }).join('\n')
    return `### ${c.owner}/${c.repo}: ${c.totalChangeCount} changes\nSkills:\n${skills}\n\nDiff excerpt:\n${c.diffExcerpt.slice(0, 3000) || '(SHA-only update; diff unavailable)'}`
  }).join('\n\n')

  const userPrompt = `Recent changes:\n\n${changesBlock}`

  const outcome = await input.ai.run(MODEL, {
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 1024,
    thinking: { type: 'disabled' },
  }).then(
    value => ({ _tag: 'response' as const, value }),
    error => ({
      _tag: 'failure' as const,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  if (outcome._tag === 'failure') {
    return {
      _tag: 'fallback',
      reason: 'provider_failure',
      error: outcome.error,
    }
  }

  const parsedResponse = parseAiResponse(outcome.value)
  if (parsedResponse._tag === 'invalid')
    return { _tag: 'fallback', reason: parsedResponse.reason }

  const json = extractJson<unknown>(parsedResponse.text)
  const summaries = parseSummaries(json)
  if (!summaries)
    return { _tag: 'fallback', reason: 'invalid_response' }

  return {
    _tag: 'summarized',
    summaries,
    usage: parsedResponse.usage,
  }
}

type ParsedAiResponse
  = {
    _tag: 'parsed'
    text: string
    usage: { inputTokens: number, outputTokens: number } | null
  }
  | { _tag: 'invalid', reason: 'empty_response' | 'invalid_response' }

function parseAiResponse(value: unknown): ParsedAiResponse {
  if (typeof value !== 'object' || value === null || !('content' in value) || !Array.isArray(value.content))
    return { _tag: 'invalid', reason: 'invalid_response' }
  const text = value.content
    .filter((block): block is { type: 'text', text: string } =>
      typeof block === 'object'
      && block !== null
      && 'type' in block
      && block.type === 'text'
      && 'text' in block
      && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
  if (!text)
    return { _tag: 'invalid', reason: 'empty_response' }
  return {
    _tag: 'parsed',
    text,
    usage: 'usage' in value ? parseUsage(value.usage) : null,
  }
}

function parseUsage(value: unknown): { inputTokens: number, outputTokens: number } | null {
  if (typeof value !== 'object'
    || value === null
    || !('input_tokens' in value)
    || !('output_tokens' in value)
    || !Number.isInteger(value.input_tokens)
    || !Number.isInteger(value.output_tokens)
    || (value.input_tokens as number) < 0
    || (value.output_tokens as number) < 0) {
    return null
  }
  return {
    inputTokens: value.input_tokens as number,
    outputTokens: value.output_tokens as number,
  }
}

function parseSummaries(value: unknown): SkillSummary[] | null {
  if (typeof value !== 'object'
    || value === null
    || !('summaries' in value)
    || !Array.isArray(value.summaries)) {
    return null
  }
  const summaries: SkillSummary[] = []
  for (const item of value.summaries) {
    if (typeof item !== 'object'
      || item === null
      || !('owner' in item)
      || !('repo' in item)
      || !('sentence' in item)
      || typeof item.owner !== 'string'
      || typeof item.repo !== 'string'
      || typeof item.sentence !== 'string'
      || !item.owner.trim()
      || !item.repo.trim()
      || !item.sentence.trim()) {
      return null
    }
    summaries.push({
      owner: item.owner,
      repo: item.repo,
      sentence: item.sentence,
    })
  }
  return summaries
}

function extractJson<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\n([\s\S]*?)```/)
  const raw = fence ? fence[1]! : text
  const start = raw.indexOf('{')
  if (start === -1)
    return null
  const end = raw.lastIndexOf('}')
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T
  }
  catch {
    return null
  }
}
