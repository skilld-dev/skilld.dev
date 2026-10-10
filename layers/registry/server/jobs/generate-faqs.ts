/// <reference types="@cloudflare/workers-types" />
import { callHaiku, extractJson } from '~~/shared/server/anthropic'
import { getGenerated, putGenerated, sha1 } from '../utils/skill-generated'

export interface FaqItem {
  question: string
  answer: string
}

export interface FaqPayload {
  items: FaqItem[]
  model: string
}

const FAQ_SYSTEM = `You write SEO-friendly FAQs for Claude Code skill pages.

You will receive the raw SKILL.md content for one skill. Produce 4-6 natural
questions a developer would type into Google or ChatGPT when evaluating this
skill. Each answer should be 1-3 sentences, factual, grounded only in the
provided content (no invented features).

Prefer questions that capture long-tail intent:
- "does X need an API key"
- "what models does X support"
- "can I use X with Y"
- "what does X do differently from Z"
- "how do I install X"

Return strict JSON with shape:
{"items": [{"question": "...", "answer": "..."}]}

Do not include any prose outside the JSON. Do not reference internal Claude
tool names like "Bash" or "Read" unless the skill itself calls them out.`

export interface FaqContext {
  db: D1Database
  /** When absent, `callHaiku` falls back to `claude -p`. */
  apiKey?: string | undefined
}

export interface FaqSkill {
  owner: string
  repo: string
  name: string
  raw: string
}

export async function generateFaqs(ctx: FaqContext, skill: FaqSkill): Promise<FaqPayload | null> {
  const currentSha = await sha1(skill.raw)
  const existing = await getGenerated<FaqPayload>(ctx.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'faq' })
  if (existing && existing.sha === currentSha)
    return existing.payload

  const truncated = skill.raw.length > 16000 ? `${skill.raw.slice(0, 16000)}\n\n[truncated]` : skill.raw
  const userPrompt = `Skill: ${skill.name} (${skill.owner}/${skill.repo})\n\n---\n\n${truncated}`

  const res = await callHaiku({
    systemPrompt: FAQ_SYSTEM,
    userPrompt,
    apiKey: ctx.apiKey,
    maxTokens: 1600,
  })

  const parsed = extractJson<{ items?: FaqItem[] }>(res.text)
  if (!parsed?.items || !Array.isArray(parsed.items))
    return null

  const items = parsed.items
    .filter(i => typeof i?.question === 'string' && typeof i?.answer === 'string')
    .map(i => ({ question: i.question.trim(), answer: i.answer.trim() }))
    .filter(i => i.question && i.answer)

  if (items.length < 3)
    return null

  const payload: FaqPayload = { items: items.slice(0, 6), model: 'claude-haiku-5-5' }

  await putGenerated(ctx.db, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    kind: 'faq',
    sha: currentSha,
    payload,
  })

  return payload
}
