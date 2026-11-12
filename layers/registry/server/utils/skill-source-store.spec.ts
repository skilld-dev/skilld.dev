import type { SkillSourceBucket } from './skill-source-store'
import { describe, expect, it } from 'vitest'
import { skillContentSha256 } from './skill-content-hash'
import { hasSkillSource, putSkillSource, readSkillSource, skillSourceR2Key } from './skill-source-store'

interface StoredObject {
  bytes: Uint8Array
  sha256: unknown
  customMetadata: unknown
}

function memoryBucket(objects = new Map<string, StoredObject>(), failPut = false): SkillSourceBucket & { objects: Map<string, StoredObject> } {
  return {
    objects,
    put: (async (key: string, value: Uint8Array, options: { onlyIf?: { etagDoesNotMatch?: string }, sha256?: unknown, customMetadata?: unknown }) => {
      if (failPut)
        throw new Error('r2 unavailable')
      if (options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key))
        return null
      objects.set(key, { bytes: value, sha256: options.sha256, customMetadata: options.customMetadata })
      return { key }
    }) as unknown as SkillSourceBucket['put'],
    get: (async (key: string) => {
      const object = objects.get(key)
      return object ? { text: async () => new TextDecoder().decode(object.bytes) } : null
    }) as unknown as SkillSourceBucket['get'],
    head: (async (key: string) => (objects.has(key) ? { key } : null)) as unknown as SkillSourceBucket['head'],
  }
}

describe('skill source store', () => {
  it('stores a body under its hash and reports a repeat as existing', async () => {
    const bucket = memoryBucket()
    const body = '---\nname: one\n---\n# One'
    const contentSha256 = await skillContentSha256(body)

    const first = await putSkillSource(bucket, { body, contentSha256 })
    const second = await putSkillSource(bucket, { body, contentSha256 })

    expect(first).toEqual({ _tag: 'stored', key: skillSourceR2Key(contentSha256) })
    expect(second).toEqual({ _tag: 'existing', key: skillSourceR2Key(contentSha256) })
    expect(bucket.objects.get(skillSourceR2Key(contentSha256))?.sha256).toBe(contentSha256)
    expect(await hasSkillSource(bucket, contentSha256)).toBe(true)
  })

  it('returns a failure value instead of throwing when the put fails', async () => {
    const bucket = memoryBucket(new Map(), true)

    const result = await putSkillSource(bucket, { body: 'x', contentSha256: 'ab'.repeat(32) })

    expect(result).toMatchObject({ _tag: 'failed', reason: 'r2 unavailable' })
  })

  it('reads R2 first and falls back to the stored D1 body', async () => {
    const bucket = memoryBucket()
    const body = '# From R2'
    const contentSha256 = await skillContentSha256(body)
    await putSkillSource(bucket, { body, contentSha256 })

    await expect(readSkillSource(bucket, { contentSha256, storedBody: '# From D1' }))
      .resolves
      .toEqual({ _tag: 'ok', body, from: 'r2' })
    await expect(readSkillSource(bucket, { contentSha256: 'cd'.repeat(32), storedBody: '# From D1' }))
      .resolves
      .toEqual({ _tag: 'ok', body: '# From D1', from: 'd1' })
    await expect(readSkillSource(null, { contentSha256, storedBody: '# From D1' }))
      .resolves
      .toEqual({ _tag: 'ok', body: '# From D1', from: 'd1' })
    await expect(readSkillSource(bucket, { contentSha256: null, storedBody: null }))
      .resolves
      .toEqual({ _tag: 'missing' })
  })
})
