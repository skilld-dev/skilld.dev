/// <reference types="@cloudflare/workers-types" />
/**
 * Embedding-based tagger. One call per tag (30 embeds total, cacheable
 * forever), then cosine-similarity vs a skill's own embedding — no LLM
 * needed. Cheap, deterministic, and scales to the full 80k skill catalog
 * without any per-skill API spend.
 *
 * Picks tags whose similarity is within `margin` of the top score, capped
 * at `maxTags`. Also requires a `floor` score to avoid force-tagging
 * unrelated skills.
 *
 * Uses the same embedding backend (real Voyage key or hash fallback) as
 * `generate-embeddings.ts`, so run the embed job first before this one.
 */
import type { EmbeddingContext, EmbeddingSkill } from './generate-embeddings'
import type { TagPayload } from './generate-tags'
import { putGenerated, sha1 } from '../utils/skill-generated'
import { generateEmbedding } from './generate-embeddings'
import { TAXONOMY } from './taxonomy'

export interface TagCentroid {
  slug: string
  vector: number[]
}

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!
  return dot
}

function tagInputText(tag: typeof TAXONOMY[number]): string {
  return `${tag.label}\n${tag.description}`
}

/**
 * Embed every taxonomy entry once, cache in KV keyed by model+taxonomy hash.
 * Rebuilt if taxonomy changes (hash flips) or the embedding model changes.
 */
export async function getTagCentroids(ctx: EmbeddingContext): Promise<TagCentroid[]> {
  const taxonomySha = await sha1(TAXONOMY.map(t => `${t.slug}:${t.label}:${t.description}`).join('\n'))
  const model = ctx.voyageKey ? 'voyage-3-lite' : 'hash-fallback-v1'
  const cacheKey = `skills:tag-centroids:${model}:${taxonomySha}`
  const cached = await useStorage('cache').getItem<TagCentroid[]>(cacheKey)
  if (cached)
    return cached

  const centroids: TagCentroid[] = []
  for (const tag of TAXONOMY) {
    const skill: EmbeddingSkill = {
      owner: '__tag__',
      repo: '__tag__',
      name: tag.slug,
      displayName: tag.label,
      description: tag.description,
      raw: tagInputText(tag),
    }
    const emb = await generateEmbedding(ctx, skill)
    if (emb)
      centroids.push({ slug: tag.slug, vector: emb.vector })
  }

  await useStorage('cache').setItem(cacheKey, centroids, { ttl: 60 * 60 * 24 * 30 })
  return centroids
}

export interface EmbedTagContext extends EmbeddingContext {
  /** Top-score minus this much still qualifies as a tag. Typical 0.02–0.05. */
  margin?: number
  /** Hard floor below which no tag is assigned. */
  floor?: number
  /** Max tags per skill. */
  maxTags?: number
}

export async function generateTagsEmbed(ctx: EmbedTagContext, skill: EmbeddingSkill): Promise<TagPayload | null> {
  const margin = ctx.margin ?? 0.02
  const floor = ctx.floor ?? 0.08
  const maxTags = ctx.maxTags ?? 3

  const skillEmb = await generateEmbedding(ctx, skill)
  if (!skillEmb)
    return null
  const centroids = await getTagCentroids(ctx)

  const scored = centroids
    .map(c => ({ slug: c.slug, score: cosine(skillEmb.vector, c.vector) }))
    .sort((a, b) => b.score - a.score)

  if (!scored.length || scored[0]!.score < floor)
    return null

  const top = scored[0]!.score
  const picked = scored
    .filter(s => s.score >= Math.max(floor, top - margin))
    .slice(0, maxTags)
    .map(s => s.slug)

  if (!picked.length)
    return null

  const payload: TagPayload = { tags: picked, model: `embed:${skillEmb.model}` }

  const skillTextSha = await sha1(`${skill.displayName}\n${skill.description ?? ''}\n${skill.raw.slice(0, 500)}`)
  await putGenerated(ctx.db, {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    kind: 'tags',
    sha: skillTextSha,
    payload,
  })

  return payload
}

/** Bypass storage and just return scored candidates — useful for calibration. */
export async function scoreSkillAgainstTaxonomy(ctx: EmbeddingContext, skill: EmbeddingSkill): Promise<{ slug: string, score: number }[]> {
  const [skillEmb, centroids] = await Promise.all([
    generateEmbedding(ctx, skill),
    getTagCentroids(ctx),
  ])
  if (!skillEmb)
    return []
  return centroids
    .map(c => ({ slug: c.slug, score: cosine(skillEmb.vector, c.vector) }))
    .sort((a, b) => b.score - a.score)
}

export type { TagPayload } from './generate-tags'
