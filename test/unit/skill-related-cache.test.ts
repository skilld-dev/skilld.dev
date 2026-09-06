import { describe, expect, it } from 'vitest'
import { relatedCacheKey } from '../../layers/registry/server/utils/skill-related'

describe('skill-related cache key', () => {
  it('is scoped to one skill identity', () => {
    expect(relatedCacheKey({ owner: 'kotlin', repo: 'kotlin-agent-skills', name: 'jpa' }))
      .toBe('skills:related:v3:kotlin/kotlin-agent-skills/jpa')
  })

  it('separates skills sharing a name across repos', () => {
    const a = relatedCacheKey({ owner: 'richtabor', repo: 'agent-skills', name: 'humanize' })
    const b = relatedCacheKey({ owner: 'other', repo: 'agent-skills', name: 'humanize' })
    expect(a).not.toBe(b)
  })
})
