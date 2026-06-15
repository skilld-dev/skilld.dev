/// <reference types="@cloudflare/workers-types" />
import { callHaiku, extractJson } from '~~/shared/server/anthropic'
import { getGenerated, putGenerated, sha1 } from '../utils/skill-generated'
import { TAG_BY_SLUG, TAXONOMY_HINT } from './taxonomy'

export interface TagPayload {
  tags: string[]
  model: string
}

const TAGS_SYSTEM = `You tag Claude Code skills against a fixed taxonomy.

Pick 1 to 3 tags that best describe the skill's primary purpose. Choose by the
work the skill automates, not incidental mentions. If unsure between two,
prefer the more specific one. Never invent tags outside the list.

Taxonomy (use the slug, not the label):
${TAXONOMY_HINT}

Return strict JSON: {"tags": ["slug1", "slug2"]}. No prose outside the JSON.`

export interface TagContext {
  db: D1Database
  /** When absent, `callHaiku` falls back to `claude -p`. */
  apiKey?: string | undefined
}

export interface TagSkill {
  owner: string
  repo: string
  name: string
  displayName: string
  raw: string
}

export async function generateTags(ctx: TagContext, skill: TagSkill): Promise<TagPayload | null> {
  const currentSha = await sha1(skill.raw)
  const existing = await getGenerated<TagPayload>(ctx.db, { owner: skill.owner, repo: skill.repo, name: skill.name, kind: 'tags' })
  if (existing && existing.sha === currentSha)
    return existing.payload

  const truncated = skill.raw.length > 8000 ? `${skill.raw.slice(0, 8000)}\n\n[truncated]` : skill.raw
  const userPrompt = `Skill: ${skill.displayName} (${skill.name}) by ${skill.owner}/${skill.repo}\n\n---\n\n${truncated}`

  const res = await callHaiku({
    systemPrompt: TAGS_SYSTEM,
    userPrompt,
    apiKey: ctx.apiKey,
    maxTokens: 200,
  })

  const parsed = extractJson<{ tags?: string[] }>(res.text)
  if (!parsed?.tags || !Array.isArray(parsed.tags)) {
    console.warn(`[tags] no JSON in response for ${skill.owner}/${skill.name}:`, res.text.slice(0, 300))
    return null
  }

  const tags = parsed.tags
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter(t => TAG_BY_SLUG.has(t))
    .slice(0, 3)

  if (!tags.length)
    return null

  const payload: TagPayload = { tags, model: 'claude-haiku-4-5-20251001' }

  await putGenerated(ctx.db, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    kind: 'tags',
    sha: currentSha,
    payload,
  })

  return payload
}
