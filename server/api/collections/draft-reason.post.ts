import { z } from 'zod'
import { callHaikuApi } from '../../utils/anthropic'
import { getDB } from '../../utils/db'

const Body = z.object({
  packageName: z.string().min(1).max(128),
  owner: z.string().max(128).optional(),
  repo: z.string().max(128).optional(),
})

const SYSTEM_PROMPT = `You write short curator notes for an agent-skills registry.
Given a SKILL.md, return ONE sentence (max 24 words) in the curator's voice — first person, casual, specific.
Lead with the concrete situation the curator reaches for it in. Avoid marketing language, "powerful", "robust", "leverage".
Return only the sentence. No quotes, no preamble.`

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, Body.parse)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey)
    throw createError({ statusCode: 503, message: 'LLM drafting not configured' })

  const db = getDB(event)

  let owner = body.owner
  let repo = body.repo
  if (!owner || !repo) {
    const row = await db
      .prepare('SELECT owner, repo FROM skills WHERE name = ? LIMIT 1')
      .bind(body.packageName)
      .first<{ owner: string, repo: string }>()
    if (!row)
      throw createError({ statusCode: 404, message: 'Skill not found' })
    owner = row.owner
    repo = row.repo
  }

  const repoMeta = await $fetch<{ defaultBranch?: string }>(
    `https://ungh.cc/repos/${owner}/${repo}`,
  ).catch(() => null)
  const branch = repoMeta?.defaultBranch || 'main'

  const treeRes = await $fetch<{ files?: { path: string }[] }>(
    `https://ungh.cc/repos/${owner}/${repo}/files/${branch}`,
  ).catch(() => null)

  const slugified = body.packageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const skillPath = (treeRes?.files ?? []).find(f =>
    f.path.toLowerCase().endsWith(`/${slugified}/skill.md`)
    || f.path.toLowerCase() === `${slugified}/skill.md`,
  )?.path
  if (!skillPath)
    throw createError({ statusCode: 404, message: 'SKILL.md not found' })

  const raw = await $fetch<string>(
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`,
    { responseType: 'text' },
  ).catch(() => null)
  if (!raw)
    throw createError({ statusCode: 502, message: 'Could not fetch SKILL.md' })

  const trimmed = raw.length > 6000 ? `${raw.slice(0, 6000)}\n[...truncated]` : raw

  const res = await callHaikuApi({
    apiKey,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: trimmed,
    maxTokens: 80,
    cacheSystem: true,
  })

  const text = res.text.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ')
  return { draft: text }
})
