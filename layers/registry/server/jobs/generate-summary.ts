import { getGenerated, putGenerated, sha1 } from '~~/layers/registry/server/utils/skill-generated'
/// <reference types="@cloudflare/workers-types" />
import { callHaiku, extractJson } from '~~/shared/server/anthropic'

export interface SummaryPayload {
  tagline: string
  blurb: string
  useCases: string[]
  model: string
}

const SUMMARY_SYSTEM = `You write SEO-friendly summaries for Claude Code skill pages.

You will receive the raw SKILL.md for one skill. Produce three outputs grounded
strictly in the source — no invented features, no marketing hype, no hedging.

1. tagline: a single sentence, max 110 characters, that names what the skill
   does in plain language a developer would search for. Avoid the word "skill".
   Avoid "Claude Code" unless the skill itself is about Claude Code tooling.
   Lead with the noun phrase a user would Google (e.g. "Apex test class
   generator", "research paper figure builder"), not with "A skill that…".

2. blurb: 2-3 sentences (max 350 characters total) describing the problem the
   skill solves, who it's for, and when to reach for it. Include the concrete
   nouns and verbs from the SKILL.md (frameworks, file types, commands).

3. useCases: 3-5 bullet phrases, each starting with a verb. 4-9 words each.
   Each bullet should be a discrete task the skill performs, not a feature
   list. Prefer task-intent phrasing developers would type into search.

Return strict JSON:
{"tagline": "...", "blurb": "...", "useCases": ["...", "..."]}

No prose outside the JSON. Do not name internal Claude tools (Bash, Read, etc.)
unless the skill itself foregrounds them.`

export interface SummaryContext {
  db: D1Database
  /** When absent, `callHaiku` falls back to `claude -p`. */
  apiKey?: string | undefined
}

export interface SummarySkill {
  owner: string
  repo: string
  name: string
  displayName: string
  raw: string
}

export async function generateSummary(ctx: SummaryContext, skill: SummarySkill): Promise<SummaryPayload | null> {
  const currentSha = await sha1(skill.raw)
  const existing = await getGenerated<SummaryPayload>(ctx.db, { owner: skill.owner, name: skill.name, kind: 'summary' })
  if (existing && existing.sha === currentSha)
    return existing.payload

  const truncated = skill.raw.length > 12000 ? `${skill.raw.slice(0, 12000)}\n\n[truncated]` : skill.raw
  const userPrompt = `Skill: ${skill.displayName} (${skill.name}) by ${skill.owner}/${skill.repo}\n\n---\n\n${truncated}`

  const res = await callHaiku({
    systemPrompt: SUMMARY_SYSTEM,
    userPrompt,
    apiKey: ctx.apiKey,
    maxTokens: 800,
  })

  const parsed = extractJson<{ tagline?: string, blurb?: string, useCases?: string[] }>(res.text)
  if (!parsed) {
    console.warn(`[summary] no JSON in response for ${skill.owner}/${skill.name}:`, res.text.slice(0, 300))
    return null
  }

  const tagline = typeof parsed.tagline === 'string' ? parsed.tagline.trim() : ''
  const blurb = typeof parsed.blurb === 'string' ? parsed.blurb.trim() : ''
  const useCases = Array.isArray(parsed.useCases)
    ? parsed.useCases
        .filter((u): u is string => typeof u === 'string')
        .map(u => u.trim())
        .filter(Boolean)
        .slice(0, 5)
    : []

  if (!tagline || !blurb || useCases.length < 3)
    return null

  const payload: SummaryPayload = {
    tagline: tagline.slice(0, 140),
    blurb: blurb.slice(0, 400),
    useCases,
    model: 'claude-haiku-4-5-20251001',
  }

  await putGenerated(ctx.db, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    kind: 'summary',
    sha: currentSha,
    payload,
  })

  return payload
}
