import type { RegistrySkill } from '../../layers/registry/server/utils/skills-registry'
import { describe, expect, it } from 'vitest'
import { rankSearchResults, skillKey } from '../../layers/registry/server/utils/skill-search'

function skill(name: string, description: string): RegistrySkill {
  return {
    owner: 'example',
    repo: 'skills',
    name,
    displayName: name,
    slug: `example/${name}`,
    registryPath: `/gh/example/skills/${name}`,
    description,
    stars: 0,
    renderedRawSha256: null,
    seoIndexScore: 0,
    seoIndexable: true,
    trustTier: 'candidate',
    trustScore: 0,
    pushedAt: null,
    modifiedAt: null,
    firstSeenAt: null,
  }
}

function rank(query: string, entries: Array<[RegistrySkill, number]>): string[] {
  return rankSearchResults(
    entries.map(([row]) => row),
    new Map(entries.map(([row, score]) => [skillKey(row), score])),
    query,
  ).map(row => row.name)
}

describe('search phrase relevance', () => {
  it('places a complete memory leaks description above isolated stop and memory matches', () => {
    expect(rank('stop memory leaks', [
      [skill('stop-slop', 'Remove repetitive prose.'), 0.025],
      [skill('session-memory', 'Store facts across agent sessions.'), 0.024],
      [skill('heap-debugging', 'Diagnose memory leaks in JavaScript applications.'), 0.020],
    ])[0]).toBe('heap-debugging')
  })

  it('does not reward an ios app fragment when retained objects are missing', () => {
    expect(rank('find retained objects in an ios app', [
      [skill('heap-inspection', 'Inspect persistent allocations and ownership paths.'), 0.025],
      [skill('mobile-setup', 'Create an ios app with navigation and themes.'), 0.020],
    ])).toEqual(['heap-inspection', 'mobile-setup'])
  })

  it('preserves semantic order when descriptions use different words', () => {
    expect(rank('make websites load faster', [
      [skill('loading-states', 'Show skeleton screens during data fetching.'), 0.015],
      [skill('performance', 'Reduce browser rendering and network delays.'), 0.025],
    ])).toEqual(['performance', 'loading-states'])
  })

  it('matches case and punctuation without joining separate fields', () => {
    expect(rank('Please fix MEMORY-LEAKS', [
      [skill('session', 'Store facts across sessions.'), 0.025],
      [skill('memory', 'Leaks private facts during export.'), 0.021],
      [skill('heap-debugging', 'Diagnose memory: leaks in JavaScript.'), 0.020],
    ])[0]).toBe('heap-debugging')
  })

  it('matches Unicode words in a complete phrase', () => {
    expect(rank('please CAFÉ—RÉSUMÉ', [
      [skill('generic', 'Create documents.'), 0.025],
      [skill('specialist', 'Review café résumé typography.'), 0.020],
    ])[0]).toBe('specialist')
  })

  it.each(['memory', 'please help', '', 'please find memory'])('does not add phrase evidence for %s', (query) => {
    expect(rank(query, [
      [skill('first', 'General guidance.'), 0.025],
      [skill('second', 'Please help find memory.'), 0.020],
    ])).toEqual(['first', 'second'])
  })
})
