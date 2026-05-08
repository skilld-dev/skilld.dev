// Per-user Haiku summary call. Stable per-user prefix (subscriptions +
// skill descriptions) sits in `system` with cache_control; per-week diffs
// land in the user message. Failure mode: caller falls back to the
// no-summary template — never block the send.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MODEL = 'claude-haiku-4-5'

export interface SubscriptionContext {
  owner: string
  repo: string
  skillName: string
  description: string | null
}

export interface RepoChange {
  owner: string
  repo: string
  // First ~20 commit messages this window.
  commitMessages: string[]
  // First ~3000 chars of unified SKILL.md diff (or empty if SHA-only).
  diffExcerpt: string
}

export interface SkillSummary {
  owner: string
  repo: string
  sentence: string
}

export interface SummariseInput {
  apiKey: string
  subscriptions: SubscriptionContext[]
  changes: RepoChange[]
}

export interface SummariseResult {
  summaries: SkillSummary[]
  cacheRead: number
  cacheCreate: number
}

export async function summariseChanges(input: SummariseInput): Promise<SummariseResult | null> {
  if (!input.apiKey || !input.changes.length)
    return null

  // Sort deterministically so the cached prefix stays byte-stable across
  // weeks even if subscription insertion order differs.
  const subs = [...input.subscriptions].sort((a, b) =>
    `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`))
  const subBlock = subs
    .map(s => `- ${s.owner}/${s.repo} (${s.skillName})${s.description ? `: ${s.description}` : ''}`)
    .join('\n')

  const systemPrompt = `You write one-sentence summaries of changes to AI agent skills for a weekly digest email.

For each repo with changes, return one sentence (max ~20 words) describing what changed and why a developer using this skill might care. Be concrete; no marketing fluff.

Subscriptions for this user:
${subBlock}

Output JSON only, no prose, with this exact shape:
{"summaries":[{"owner":"...","repo":"...","sentence":"..."}]}`

  const changesBlock = input.changes.map((c) => {
    const commits = c.commitMessages.slice(0, 20).map(m => `  - ${m}`).join('\n')
    return `### ${c.owner}/${c.repo}\nCommits:\n${commits || '  (no commit messages)'}\n\nDiff excerpt:\n${c.diffExcerpt.slice(0, 3000) || '(SHA-only update — diff unavailable)'}`
  }).join('\n\n')

  const userPrompt = `This week's changes:\n\n${changesBlock}`

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    return null

  const data = await res.json() as {
    content: { type: string, text?: string }[]
    usage: { cache_read_input_tokens?: number, cache_creation_input_tokens?: number }
  }

  const text = data.content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text!)
    .join('')

  const json = extractJson<{ summaries?: SkillSummary[] }>(text)
  if (!json?.summaries)
    return null

  return {
    summaries: json.summaries.filter(s => s.owner && s.repo && s.sentence),
    cacheRead: data.usage.cache_read_input_tokens ?? 0,
    cacheCreate: data.usage.cache_creation_input_tokens ?? 0,
  }
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
