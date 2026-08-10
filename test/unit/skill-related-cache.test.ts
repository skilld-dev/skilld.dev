import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { relatedCacheKey } from '../../layers/registry/server/utils/skill-related'

const handlerPath = join(
  process.cwd(),
  'layers/registry/server/api/skill-related/[...slug].get.ts',
)
const source = readFileSync(handlerPath, 'utf8')

describe('skill-related cache key', () => {
  it('is scoped to one skill identity', () => {
    expect(relatedCacheKey({ owner: 'kotlin', repo: 'kotlin-agent-skills', name: 'jpa' }))
      .toBe('skills:related:v1:kotlin/kotlin-agent-skills/jpa')
  })

  it('separates skills sharing a name across repos', () => {
    const a = relatedCacheKey({ owner: 'richtabor', repo: 'agent-skills', name: 'humanize' })
    const b = relatedCacheKey({ owner: 'other', repo: 'agent-skills', name: 'humanize' })
    expect(a).not.toBe(b)
  })
})

describe('skill-related read path', () => {
  // The 2026-08-04 D1 overload burst put 839 errors on a single skill in one hour
  // because this handler ran every neighbor query uncached on each request.
  it('returns the cached response before doing any neighbor work', () => {
    const cacheRead = source.indexOf('const cached = await useStorage(\'cache\').getItem')
    const neighborWork = source.indexOf('resolveRepoSourceIdentity(platform.db')
    expect(cacheRead).toBeGreaterThan(-1)
    expect(neighborWork).toBeGreaterThan(cacheRead)
  })

  it('writes through the best-effort cache helper, never a bare setItem', () => {
    expect(source).toContain('await writeCache(useStorage(\'cache\'), cacheKey, response')
    expect(source).not.toMatch(/return\s+useStorage\('cache'\)\.setItem/)
  })

  it('does not run a full-text registry search for each cold skill', () => {
    expect(source).not.toContain('querySkills(event')
    expect(source).not.toContain('findFallbackSemanticSiblings')
  })
})
