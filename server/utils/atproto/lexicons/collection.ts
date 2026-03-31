/** AT Protocol Lexicon: dev.skilld.collection */

export const COLLECTION_NSID = 'dev.skilld.collection'

export interface PostReference {
  uri: string
  cid: string
}

export interface CollectionSkill {
  packageName: string
  reason?: string
  owner?: string
  repo?: string
}

export interface CollectionRecord {
  $type: typeof COLLECTION_NSID
  name: string
  slug: string
  description: string
  skills: CollectionSkill[]
  stacks: string[]
  postRef?: PostReference
  createdAt: string
  updatedAt: string
}

/** Validated input for creating/updating a collection (slug doubles as rkey). */
export interface CollectionInput {
  name: string
  slug: string
  description: string
  skills: CollectionSkill[]
  stacks: string[]
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const MAX_NAME = 100
const MAX_DESCRIPTION = 500
const MAX_SKILLS = 50
const MAX_STACKS = 10

export function validateCollectionInput(body: unknown): CollectionInput {
  if (!body || typeof body !== 'object')
    throw createError({ statusCode: 400, message: 'Request body must be an object' })

  const { name, slug, description, skills, stacks } = body as Record<string, unknown>

  if (typeof name !== 'string' || name.length < 1 || name.length > MAX_NAME)
    throw createError({ statusCode: 400, message: `name must be 1-${MAX_NAME} characters` })

  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.length > 64)
    throw createError({ statusCode: 400, message: 'slug must be lowercase alphanumeric with hyphens, max 64 chars' })

  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION)
    throw createError({ statusCode: 400, message: `description must be under ${MAX_DESCRIPTION} characters` })

  if (!Array.isArray(skills) || skills.length < 1 || skills.length > MAX_SKILLS)
    throw createError({ statusCode: 400, message: `skills must have 1-${MAX_SKILLS} entries` })

  for (const skill of skills) {
    if (!skill || typeof skill !== 'object' || typeof (skill as CollectionSkill).packageName !== 'string')
      throw createError({ statusCode: 400, message: 'Each skill must have a packageName string' })
  }

  if (!Array.isArray(stacks) || stacks.length > MAX_STACKS)
    throw createError({ statusCode: 400, message: `stacks must be an array with at most ${MAX_STACKS} entries` })

  for (const stack of stacks) {
    if (typeof stack !== 'string')
      throw createError({ statusCode: 400, message: 'Each stack must be a string' })
  }

  return {
    name,
    slug,
    description,
    skills: skills.map((s: CollectionSkill) => ({
      packageName: s.packageName,
      ...(s.reason ? { reason: s.reason } : {}),
      ...(s.owner ? { owner: s.owner } : {}),
      ...(s.repo ? { repo: s.repo } : {}),
    })),
    stacks: stacks.filter((s): s is string => typeof s === 'string'),
  }
}

/** Build a full CollectionRecord from validated input. */
export function toCollectionRecord(input: CollectionInput, opts?: { existingCreatedAt?: string, postRef?: PostReference }): CollectionRecord {
  const now = new Date().toISOString()
  return {
    $type: COLLECTION_NSID,
    name: input.name,
    slug: input.slug,
    description: input.description,
    skills: input.skills,
    stacks: input.stacks,
    ...(opts?.postRef ? { postRef: opts.postRef } : {}),
    createdAt: opts?.existingCreatedAt ?? now,
    updatedAt: now,
  }
}

/**
 * Validate a record read from a PDS against the collection schema.
 * Returns the record if valid, null if malformed.
 */
export function parseCollectionRecord(value: unknown): CollectionRecord | null {
  if (!value || typeof value !== 'object')
    return null

  const v = value as Record<string, unknown>

  if (typeof v.name !== 'string' || typeof v.slug !== 'string')
    return null
  if (typeof v.description !== 'string')
    return null
  if (!Array.isArray(v.skills) || v.skills.length === 0)
    return null
  if (!Array.isArray(v.stacks))
    return null
  if (typeof v.createdAt !== 'string' || typeof v.updatedAt !== 'string')
    return null

  // Validate each skill entry
  for (const skill of v.skills) {
    if (!skill || typeof skill !== 'object' || typeof (skill as CollectionSkill).packageName !== 'string')
      return null
  }

  // Validate postRef if present
  let postRef: PostReference | undefined
  if (v.postRef && typeof v.postRef === 'object') {
    const ref = v.postRef as Record<string, unknown>
    if (typeof ref.uri === 'string' && typeof ref.cid === 'string')
      postRef = { uri: ref.uri, cid: ref.cid }
  }

  return {
    $type: COLLECTION_NSID,
    name: v.name,
    slug: v.slug,
    description: v.description,
    skills: (v.skills as CollectionSkill[]).map(s => ({
      packageName: s.packageName,
      ...(s.reason ? { reason: s.reason } : {}),
      ...(s.owner ? { owner: s.owner } : {}),
      ...(s.repo ? { repo: s.repo } : {}),
    })),
    stacks: (v.stacks as string[]).filter(s => typeof s === 'string'),
    ...(postRef ? { postRef } : {}),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}
