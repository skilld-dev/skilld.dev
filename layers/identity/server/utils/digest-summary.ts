// Per-user digest summaries via the Workers AI binding. No gateway, no
// API key — `env.AI.run(model, ...)` is authenticated implicitly by the
// Worker→Cloudflare relationship. Failure mode: caller falls back to the
// no-summary template — never block the send.
//
// Workers AI has no Anthropic-style prompt caching; the cost per call is
// low enough that re-paying the full prompt each week is fine.

interface AiBinding {
  run: (model: string, input: { messages: Array<{ role: string, content: string }>, max_tokens?: number, response_format?: { type: 'json_schema', json_schema: object } }) => Promise<{ response?: string }>
}

// Anthropic Haiku 4.5 brokered through Workers AI. The binding handles auth;
// no Anthropic key or gateway token needed. Swap to a llama/qwen if cost or
// latency need to drop later — caller doesn't care which model produced
// `response`.
const MODEL = 'anthropic/claude-haiku-4.5'

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
  ai: AiBinding
  subscriptions: SubscriptionContext[]
  changes: RepoChange[]
}

export interface SummariseResult {
  summaries: SkillSummary[]
}

export async function summariseChanges(input: SummariseInput): Promise<SummariseResult | null> {
  if (!input.ai || !input.changes.length)
    return null

  const subs = [...input.subscriptions].sort((a, b) =>
    `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`))
  const subBlock = subs
    .map(s => `- ${s.owner}/${s.repo} (${s.skillName})${s.description ? `: ${s.description}` : ''}`)
    .join('\n')

  const systemPrompt = `You write one-sentence summaries of changes to AI agent skills for a weekly digest email.

For each repo with changes, return one sentence (max ~20 words) describing what changed and why a developer using this skill might care. Be concrete; no marketing fluff.

Subscriptions for this user:
${subBlock}

Return JSON matching the provided schema. The "summaries" array has one entry per repo that changed.`

  const changesBlock = input.changes.map((c) => {
    const commits = c.commitMessages.slice(0, 20).map(m => `  - ${m}`).join('\n')
    return `### ${c.owner}/${c.repo}\nCommits:\n${commits || '  (no commit messages)'}\n\nDiff excerpt:\n${c.diffExcerpt.slice(0, 3000) || '(SHA-only update — diff unavailable)'}`
  }).join('\n\n')

  const userPrompt = `This week's changes:\n\n${changesBlock}`

  const out = await input.ai.run(MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1024,
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: {
          summaries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                owner: { type: 'string' },
                repo: { type: 'string' },
                sentence: { type: 'string' },
              },
              required: ['owner', 'repo', 'sentence'],
            },
          },
        },
        required: ['summaries'],
      },
    },
  }).catch(() => null)

  const text = out?.response ?? ''
  if (!text)
    return null

  const json = extractJson<{ summaries?: SkillSummary[] }>(text)
  if (!json?.summaries)
    return null

  return {
    summaries: json.summaries.filter(s => s.owner && s.repo && s.sentence),
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
