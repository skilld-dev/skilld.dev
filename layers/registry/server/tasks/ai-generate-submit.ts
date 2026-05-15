import { ABSTRACTNESS_SYSTEM_PROMPT, BATCH_KINDS, SHARED_SYSTEM_PROMPT } from '~~/layers/registry/server/utils/ai-prompts'
/// <reference types="@cloudflare/workers-types" />
import { putGenerated } from '~~/layers/registry/server/utils/skill-generated'
import { extractJson } from '#shared/server/anthropic'

const BATCH_LIMIT = 200
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_BATCH_URL = 'https://api.anthropic.com/v1/messages/batches'
const ANTHROPIC_VERSION = '2023-06-01'

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const ABSTRACTNESS_MODEL = '@cf/meta/llama-3.2-1b-instruct'
const VECTORIZE_DIM = 768

interface StaleSkillRow {
  owner: string
  repo: string
  name: string
  current_sha: string
  rendered_raw: string | null
  display_name: string | null
}

interface AnthropicAiResult {
  content?: Array<{ type: string, text?: string }>
}

interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>
}

interface VectorizeBinding {
  upsert: (vectors: VectorizeVector[]) => Promise<unknown>
}

interface BatchRequestItem {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    system: Array<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>
    messages: Array<{ role: 'user', content: string }>
  }
}

// custom_id must be ASCII-safe and ≤64 chars. owner/repo/name are
// freeform; hash them to a short prefix and append the kind. We also store
// the original mapping in payload-by-index so the poll task can resolve.
function encodeCustomId(index: number, kind: string): string {
  return `${index}-${kind}`
}

export default defineTask({
  meta: {
    name: 'ai-generate-submit',
    description: 'Submit Anthropic batch for stale summary/tags/faq + run Workers AI for embedding/abstractness',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    const ai = env?.AI as AiBinding | undefined
    const vectorize = env?.SKILL_EMBEDDINGS as VectorizeBinding | undefined
    const apiKey = (env?.ANTHROPIC_API_KEY as string | undefined) || process.env.ANTHROPIC_API_KEY

    if (!db) {
      console.warn('[ai-generate-submit] D1 binding missing')
      return { result: { error: 'no-db' } }
    }
    if (!apiKey) {
      console.warn('[ai-generate-submit] ANTHROPIC_API_KEY missing — batch submit skipped')
    }

    // Find skills where ANY of summary/tags/faq is stale or missing.
    // Also pull rendered_raw so we don't re-fetch from GitHub.
    const stale = await db
      .prepare(
        `SELECT s.owner, s.repo, s.name, s.current_sha, s.rendered_raw, s.display_name
         FROM skills s
         JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
         WHERE r.broken_since IS NULL
           AND s.current_sha IS NOT NULL
           AND s.rendered_raw IS NOT NULL
           AND s.rendered_status = 'ok'
           AND s.seo_indexable = 1
           AND (
             NOT EXISTS (
               SELECT 1 FROM skill_generated g
               WHERE g.owner = s.owner AND g.repo = s.repo AND g.name = s.name
                 AND g.kind = 'summary' AND g.sha = s.current_sha
             )
             OR NOT EXISTS (
               SELECT 1 FROM skill_generated g
               WHERE g.owner = s.owner AND g.repo = s.repo AND g.name = s.name
                 AND g.kind = 'tags' AND g.sha = s.current_sha
             )
             OR NOT EXISTS (
               SELECT 1 FROM skill_generated g
               WHERE g.owner = s.owner AND g.repo = s.repo AND g.name = s.name
                 AND g.kind = 'faq' AND g.sha = s.current_sha
             )
             OR NOT EXISTS (
               SELECT 1 FROM skill_generated g
               WHERE g.owner = s.owner AND g.repo = s.repo AND g.name = s.name
                 AND g.kind = 'embedding' AND g.sha = s.current_sha
             )
             OR NOT EXISTS (
               SELECT 1 FROM skill_generated g
               WHERE g.owner = s.owner AND g.repo = s.repo AND g.name = s.name
                 AND g.kind = 'abstractness' AND g.sha = s.current_sha
             )
           )
         ORDER BY s.installs DESC
         LIMIT ?1`,
      )
      .bind(BATCH_LIMIT)
      .all<StaleSkillRow>()

    const skills = (stale.results ?? []).filter(r => r.rendered_raw && r.current_sha)
    if (!skills.length)
      return { result: { scanned: 0, message: 'nothing stale' } }

    // Build batch index for custom_id resolution. Persisted alongside the
    // ai_batches row so the poll task can map results back to skills.
    const indexMap = skills.map(s => ({
      owner: s.owner,
      repo: s.repo,
      name: s.name,
      sha: s.current_sha,
    }))

    const summary = {
      scanned: skills.length,
      embeddingsWritten: 0,
      abstractnessWritten: 0,
      batchSubmitted: false,
      batchSize: 0,
      errors: [] as string[],
    }

    // --- 1. Synchronous: embedding + abstractness via Workers AI ---
    for (const skill of skills) {
      // Embedding
      if (ai && vectorize) {
        const input = (skill.rendered_raw ?? '').slice(0, 8000)
        const embed = await ai.run(EMBEDDING_MODEL, { text: [input] })
          .catch((err) => {
            summary.errors.push(`embed ${skill.owner}/${skill.name}: ${(err as Error).message}`)
            return null
          })
        // Workers AI returns { data: number[][], shape: [n, dim] }
        const vec = (embed as { data?: number[][] } | null)?.data?.[0]
        if (vec && vec.length === VECTORIZE_DIM) {
          await vectorize.upsert([{
            id: `${skill.owner}/${skill.repo}/${skill.name}`,
            values: vec,
            metadata: { sha: skill.current_sha, owner: skill.owner, repo: skill.repo, name: skill.name },
          }]).catch((err) => {
            summary.errors.push(`vectorize ${skill.owner}/${skill.name}: ${(err as Error).message}`)
          })
          await putGenerated(db, {
            owner: skill.owner,
            repo: skill.repo,
            name: skill.name,
            kind: 'embedding',
            sha: skill.current_sha,
            payload: { stored_in: 'vectorize', dim: VECTORIZE_DIM },
          })
          summary.embeddingsWritten += 1
        }
      }

      // Abstractness
      if (ai) {
        const userPrompt = `SKILL.md content:\n\n${(skill.rendered_raw ?? '').slice(0, 6000)}\n\nClassify and output the JSON object.`
        const out = await ai.run(ABSTRACTNESS_MODEL, {
          messages: [
            { role: 'system', content: ABSTRACTNESS_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 128,
          temperature: 0,
        }).catch((err) => {
          summary.errors.push(`abstract ${skill.owner}/${skill.name}: ${(err as Error).message}`)
          return null
        })

        // Workers AI llama returns { response: string } typically.
        const text = (out as { response?: string, content?: Array<{ text?: string }> } | null)?.response
          ?? (out as { content?: Array<{ text?: string }> } | null)?.content?.map(c => c.text ?? '').join('')
          ?? ''
        const parsed = extractJson<{ kind?: string, package?: string | null, category?: string }>(text)
        if (parsed?.kind && parsed?.category) {
          await putGenerated(db, {
            owner: skill.owner,
            repo: skill.repo,
            name: skill.name,
            kind: 'abstractness',
            sha: skill.current_sha,
            payload: {
              kind: parsed.kind,
              package: parsed.package ?? null,
              category: parsed.category,
            },
          })
          summary.abstractnessWritten += 1
        }
      }
    }

    // --- 2. Async: summary/tags/faq via Anthropic Batch API ---
    if (apiKey) {
      const requests: BatchRequestItem[] = []
      for (let i = 0; i < skills.length; i++) {
        const skill = skills[i]!
        const body = (skill.rendered_raw ?? '').slice(0, 12000)
        const displayName = skill.display_name || skill.name
        for (const kind of BATCH_KINDS) {
          const userPrompt = `Skill: ${skill.owner}/${skill.repo} — ${displayName}\nOutput kind: ${kind}\n\nSKILL.md content:\n\n${body}\n\nReturn the ${kind} output now, in the format specified by the system prompt.`
          requests.push({
            custom_id: encodeCustomId(i, kind),
            params: {
              model: HAIKU_MODEL,
              max_tokens: kind === 'faq' ? 1024 : kind === 'tags' ? 256 : 512,
              system: [{
                type: 'text',
                text: SHARED_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
              }],
              messages: [{ role: 'user', content: userPrompt }],
            },
          })
        }
      }

      const res = await fetch(ANTHROPIC_BATCH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({ requests }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        summary.errors.push(`batch submit ${res.status}: ${body.slice(0, 300)}`)
      }
      else {
        const data = await res.json() as { id: string }
        await db
          .prepare(
            `INSERT INTO ai_batches (anthropic_batch_id, kinds, skill_count, status, submitted_at, index_map)
             VALUES (?, ?, ?, 'submitted', ?, ?)`,
          )
          .bind(
            data.id,
            JSON.stringify(BATCH_KINDS),
            skills.length,
            Math.floor(Date.now() / 1000),
            JSON.stringify(indexMap),
          )
          .run()

        summary.batchSubmitted = true
        summary.batchSize = requests.length
      }
    }

    console.warn('[ai-generate-submit] done', summary)
    return { result: summary }
  },
})
