/// <reference types="@cloudflare/workers-types" />

import { ABSTRACTNESS_CATEGORIES } from './ai-prompts'

export type RuntimeGeneratedKind = 'embedding' | 'abstractness'
export const ABSTRACTNESS_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
export const ABSTRACTNESS_PROMPT_VERSION = '2026-07-27-v3'

export function runtimeGenerationLimits() {
  const invocationQueryLimit = 1_000
  const reservedQueries = 150
  // Start + marker/completion batch + failure recording when that batch fails.
  const embeddingQueriesPerItem = 4
  const abstractnessQueriesPerItem = 2
  const sharedLimit = Math.floor(
    (invocationQueryLimit - reservedQueries)
    / (embeddingQueriesPerItem + abstractnessQueriesPerItem),
  )
  return {
    embedding: Math.min(sharedLimit, 24),
    abstractness: sharedLimit,
    embeddingQueriesPerItem,
    abstractnessQueriesPerItem,
    reservedQueries,
    invocationQueryLimit,
  }
}

export interface GenerationSkill {
  owner: string
  repo: string
  name: string
  currentSha: string
  renderedRaw: string
  displayName: string | null
}

interface RawGenerationSkill {
  owner: string
  repo: string
  name: string
  current_sha: string
  rendered_raw: string
  display_name: string | null
}

export interface AbstractnessPayload {
  kind: 'abstract' | 'package-specific'
  package: string | null
  category: string
}

interface PersistedAbstractnessPayload extends AbstractnessPayload {
  model: typeof ABSTRACTNESS_MODEL
  promptVersion: typeof ABSTRACTNESS_PROMPT_VERSION
}

export type AbstractnessParseResult
  = | { _tag: 'ok', value: AbstractnessPayload }
    | {
      _tag: 'error'
      reason: 'invalid_shape' | 'invalid_kind' | 'invalid_package' | 'invalid_category'
    }

export type PersistAbstractnessResult
  = | { _tag: 'written' }
    | { _tag: 'source_changed' }

const ELIGIBLE_SKILL_SQL = `
  SELECT
    s.owner,
    s.repo,
    s.name,
    s.current_sha,
    s.rendered_raw,
    s.display_name
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  WHERE r.broken_since IS NULL
    AND s.current_sha IS NOT NULL
    AND s.rendered_raw IS NOT NULL
    AND s.rendered_status = 'ok'
    AND s.seo_indexable = 1
`

const abstractnessCategories = new Set<string>(ABSTRACTNESS_CATEGORIES)

export function buildAbstractnessUserPrompt(skill: GenerationSkill): string {
  return `Identity: ${skill.owner}/${skill.repo}/${skill.name}

SKILL.md content:

${skill.renderedRaw.slice(0, 6_000)}

Classify and output the JSON object.`
}

export async function selectMissingGeneratedSkills(
  db: D1Database,
  kind: RuntimeGeneratedKind,
  limit: number,
): Promise<GenerationSkill[]> {
  const boundedLimit = Math.max(1, Math.floor(limit))
  const freshnessPredicate = kind === 'abstractness'
    ? `AND json_extract(generated.payload, '$.promptVersion') = ?3`
    : ''
  const statement = db.prepare(
    `${ELIGIBLE_SKILL_SQL}
      AND NOT EXISTS (
        SELECT 1
        FROM skill_generated generated
        WHERE generated.owner = s.owner
          AND generated.repo = s.repo
          AND generated.name = s.name
          AND generated.kind = ?1
          AND generated.sha = s.current_sha
          ${freshnessPredicate}
      )
    ORDER BY s.installs DESC
    LIMIT ?2`,
  )
  const rows = await (kind === 'abstractness'
    ? statement.bind(kind, boundedLimit, ABSTRACTNESS_PROMPT_VERSION)
    : statement.bind(kind, boundedLimit)
  ).all<RawGenerationSkill>()

  return (rows.results ?? []).map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    currentSha: row.current_sha,
    renderedRaw: row.rendered_raw,
    displayName: row.display_name,
  }))
}

export async function selectMissingBatchSkills(
  db: D1Database,
  limit: number,
): Promise<GenerationSkill[]> {
  const boundedLimit = Math.max(1, Math.floor(limit))
  const rows = await db.prepare(
    `${ELIGIBLE_SKILL_SQL}
      AND (s.ai_generated_sha IS NULL OR s.ai_generated_sha != s.current_sha)
      AND (
        NOT EXISTS (
          SELECT 1 FROM skill_generated generated
          WHERE generated.owner = s.owner
            AND generated.repo = s.repo
            AND generated.name = s.name
            AND generated.kind = 'summary'
            AND generated.sha = s.current_sha
        )
        OR NOT EXISTS (
          SELECT 1 FROM skill_generated generated
          WHERE generated.owner = s.owner
            AND generated.repo = s.repo
            AND generated.name = s.name
            AND generated.kind = 'tags'
            AND generated.sha = s.current_sha
        )
        OR NOT EXISTS (
          SELECT 1 FROM skill_generated generated
          WHERE generated.owner = s.owner
            AND generated.repo = s.repo
            AND generated.name = s.name
            AND generated.kind = 'faq'
            AND generated.sha = s.current_sha
        )
      )
    ORDER BY s.installs DESC
    LIMIT ?1`,
  ).bind(boundedLimit).all<RawGenerationSkill>()

  return (rows.results ?? []).map(row => ({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    currentSha: row.current_sha,
    renderedRaw: row.rendered_raw,
    displayName: row.display_name,
  }))
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function abstractnessResponseText(value: unknown): string {
  const candidate = record(value)
  if (!candidate)
    return ''
  if ('response' in candidate) {
    return typeof candidate.response === 'string'
      ? candidate.response
      : JSON.stringify(candidate.response)
  }
  if (!Array.isArray(candidate.content))
    return ''
  return candidate.content.map((item) => {
    const content = record(item)
    return content && typeof content.text === 'string' ? content.text : ''
  }).join('')
}

export function parseAbstractnessPayload(value: unknown): AbstractnessParseResult {
  const candidate = record(value)
  if (!candidate)
    return { _tag: 'error', reason: 'invalid_shape' }
  if (candidate.kind !== 'abstract' && candidate.kind !== 'package-specific')
    return { _tag: 'error', reason: 'invalid_kind' }
  if (typeof candidate.category !== 'string'
    || !abstractnessCategories.has(candidate.category.trim())) {
    return { _tag: 'error', reason: 'invalid_category' }
  }

  const packageName = typeof candidate.package === 'string'
    ? candidate.package.trim()
    : candidate.package === null
      ? null
      : undefined
  if (packageName === undefined)
    return { _tag: 'error', reason: 'invalid_package' }
  if (candidate.kind === 'abstract' && packageName !== null)
    return { _tag: 'error', reason: 'invalid_package' }
  if (candidate.kind === 'package-specific' && (typeof packageName !== 'string' || !packageName))
    return { _tag: 'error', reason: 'invalid_package' }

  return {
    _tag: 'ok',
    value: {
      kind: candidate.kind,
      package: packageName,
      category: candidate.category.trim(),
    },
  }
}

export async function persistAbstractness(
  db: D1Database,
  skill: Pick<GenerationSkill, 'owner' | 'repo' | 'name' | 'currentSha'>,
  payload: AbstractnessPayload,
  nowSeconds: number,
): Promise<PersistAbstractnessResult> {
  const generatedAt = new Date(nowSeconds * 1_000).toISOString()
  const persistedPayload: PersistedAbstractnessPayload = {
    ...payload,
    model: ABSTRACTNESS_MODEL,
    promptVersion: ABSTRACTNESS_PROMPT_VERSION,
  }
  const results = await db.batch([
    db.prepare(
      `INSERT INTO skill_generated (
         owner, repo, name, kind, sha, payload, generated_at
       )
       SELECT owner, repo, name, 'abstractness', current_sha, ?5, ?6
       FROM skills
       WHERE owner = ?1
         AND repo = ?2
         AND name = ?3
         AND current_sha = ?4
       ON CONFLICT(owner, repo, name, kind) DO UPDATE SET
         sha = excluded.sha,
         payload = excluded.payload,
         generated_at = excluded.generated_at`,
    ).bind(
      skill.owner,
      skill.repo,
      skill.name,
      skill.currentSha,
      JSON.stringify(persistedPayload),
      generatedAt,
    ),
    db.prepare(
      `UPDATE skills
       SET is_abstract = ?5,
           target_package = ?6,
           abstractness_category = ?7
       WHERE owner = ?1
         AND repo = ?2
         AND name = ?3
         AND current_sha = ?4`,
    ).bind(
      skill.owner,
      skill.repo,
      skill.name,
      skill.currentSha,
      payload.kind === 'abstract' ? 1 : 0,
      payload.package,
      payload.category,
    ),
  ])

  const sourceChanges = Number(results[0]?.meta.changes ?? 0)
  const denormalizedChanges = Number(results[1]?.meta.changes ?? 0)
  if (sourceChanges === 0 && denormalizedChanges === 0)
    return { _tag: 'source_changed' }
  if (sourceChanges !== 1 || denormalizedChanges < 1)
    throw new Error(`abstractness persistence was not atomic: source=${sourceChanges} denormalized=${denormalizedChanges}`)
  return { _tag: 'written' }
}
