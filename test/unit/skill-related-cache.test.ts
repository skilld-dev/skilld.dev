import { describe, expect, it } from 'vitest'
import {
  isCachedRelated,
  RELATED_CACHE_TTL,
  RELATED_MISSING_TTL,
  relatedCacheKey,
  relatedCacheWindows,
} from '../../layers/registry/server/utils/skill-related'

describe('skill-related cache key', () => {
  it('separates skills sharing a name across repos', () => {
    expect(relatedCacheKey('richtabor/agent-skills/humanize'))
      .not
      .toBe(relatedCacheKey('other/agent-skills/humanize'))
  })
})

describe('skill-related cache windows', () => {
  it('gives a resolved response the registry window', () => {
    expect(relatedCacheWindows({ _tag: 'found', response: { commits: [] } }).ttl)
      .toBe(RELATED_CACHE_TTL)
  })

  it('rechecks a missing slug far sooner than a resolved one', () => {
    const missing = relatedCacheWindows({ _tag: 'missing' })
    expect(missing.ttl).toBe(RELATED_MISSING_TTL)
    expect(missing.ttl).toBeLessThan(RELATED_CACHE_TTL)
  })

  it('keeps no stale window for a missing slug, so a new Skill is not served as absent', () => {
    expect(relatedCacheWindows({ _tag: 'missing' }).staleTtl).toBe(0)
  })
})

describe('cached related guard', () => {
  it('accepts both tagged variants', () => {
    expect(isCachedRelated({ _tag: 'missing' })).toBe(true)
    expect(isCachedRelated({ _tag: 'found', response: { commits: [] } })).toBe(true)
  })

  it('rejects a v3 value, which was an untagged raw response', () => {
    expect(isCachedRelated({ commits: [], relatedRepoSkills: [] })).toBe(false)
  })

  it('rejects a found entry carrying no response', () => {
    expect(isCachedRelated({ _tag: 'found' })).toBe(false)
  })

  it('rejects bytes that are not an object', () => {
    expect(isCachedRelated(null)).toBe(false)
    expect(isCachedRelated('found')).toBe(false)
  })
})
