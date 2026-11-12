/// <reference types="@cloudflare/workers-types" />

/**
 * SKILL.md bodies in R2, addressed by content (ADR-0019).
 *
 * `skills.rendered_raw` held every body in D1, about 9 KB a row and 117 KB at
 * the largest, and D1 is a 10 GB store. The body's SHA-256 already sits in
 * `skills.rendered_raw_sha256`, so the object key is that hash. Two Skills
 * with the same body share one object, and a retried sync writes the same
 * bytes to the same key.
 */

export const SKILL_SOURCE_FORMAT = 'skilld-skill-source-v1'

/** The subset of `R2Bucket` the store uses, so a test can pass a Map. */
export interface SkillSourceBucket {
  put: R2Bucket['put']
  get: R2Bucket['get']
  head: R2Bucket['head']
}

export type SkillSourceWrite
  = | { _tag: 'stored', key: string }
    | { _tag: 'existing', key: string }
    | { _tag: 'failed', key: string, reason: string }

export type SkillSourceRead
  = | { _tag: 'ok', body: string, from: 'r2' | 'd1' }
    | { _tag: 'missing' }

export function skillSourceR2Key(contentSha256: string): string {
  return `v1/skill-source/sha256/${contentSha256.slice(0, 2)}/${contentSha256}.md`
}

/**
 * Store one body. The key is its hash, so an object that already exists is
 * the same bytes and the put is skipped by `etagDoesNotMatch: '*'`. R2 checks
 * the bytes against the hash before it accepts them.
 *
 * A failure is a value, never a throw: during the dual-write phase D1 still
 * holds the body, and a sync must not fail for an object store hiccup.
 */
export async function putSkillSource(
  bucket: SkillSourceBucket,
  input: { body: string, contentSha256: string },
): Promise<SkillSourceWrite> {
  const key = skillSourceR2Key(input.contentSha256)
  const bytes = new TextEncoder().encode(input.body)
  try {
    const stored = await bucket.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      sha256: input.contentSha256,
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: { contentSha256: input.contentSha256, format: SKILL_SOURCE_FORMAT },
    })
    return stored ? { _tag: 'stored', key } : { _tag: 'existing', key }
  }
  catch (error) {
    return { _tag: 'failed', key, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read one body. R2 by hash first; the D1 column while it still holds bytes.
 * Every reader of a SKILL.md body goes through this, so the column can be
 * nulled and then dropped without a reader noticing.
 */
export async function readSkillSource(
  bucket: SkillSourceBucket | null,
  input: { contentSha256: string | null, storedBody: string | null },
): Promise<SkillSourceRead> {
  if (bucket && input.contentSha256) {
    const object = await bucket.get(skillSourceR2Key(input.contentSha256))
    if (object)
      return { _tag: 'ok', body: await object.text(), from: 'r2' }
  }
  if (input.storedBody)
    return { _tag: 'ok', body: input.storedBody, from: 'd1' }
  return { _tag: 'missing' }
}

/** Whether R2 holds the body for this hash. One metadata read, no body. */
export async function hasSkillSource(bucket: SkillSourceBucket, contentSha256: string): Promise<boolean> {
  return (await bucket.head(skillSourceR2Key(contentSha256))) !== null
}
