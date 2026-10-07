import type { RegistrySkill } from '../../layers/registry/server/utils/skills-registry'
import { describe, expect, it } from 'vitest'
import {
  buildFtsMatchQuery,
  buildIdentifierFtsQuery,
  collapseSearchDuplicates,
  fuseRankings,
  rankSearchResults,
  RRF_K,
  skillKey,
} from '../../layers/registry/server/utils/skill-search'

function skill(partial: Partial<RegistrySkill> & Pick<RegistrySkill, 'owner' | 'repo' | 'name'>): RegistrySkill {
  return {
    displayName: partial.name,
    slug: `${partial.owner}/${partial.name}`,
    registryPath: `/gh/${partial.owner}/${partial.repo}/${partial.name}`,
    stars: 0,
    description: null,
    renderedRawSha256: null,
    seoIndexScore: 0,
    seoIndexable: true,
    trustTier: 'candidate',
    trustScore: 0,
    pushedAt: null,
    modifiedAt: null,
    firstSeenAt: null,
    ...partial,
  }
}

describe('buildFtsMatchQuery', () => {
  it('quotes each token and prefix-matches it', () => {
    expect(buildFtsMatchQuery('vue testing')).toBe('"vue"* OR "testing"*')
  })

  // FTS5 joins bare terms with an implicit AND, which requires a single skill
  // to contain every word of the query. "stop memory leaks" matched nothing at
  // all in production because no skill contains "stop". The lexical lane is
  // for recall; BM25 sorts out which of the matches are actually good.
  it('joins tokens with OR so a prose query is not an all-terms requirement', () => {
    expect(buildFtsMatchQuery('stop memory leaks')).toBe('"stop"* OR "memory"* OR "leaks"*')
    expect(buildFtsMatchQuery('debug a flaky test')).not.toContain('AND')
  })

  it('returns null when there is nothing to match', () => {
    expect(buildFtsMatchQuery('')).toBeNull()
    expect(buildFtsMatchQuery('   ')).toBeNull()
  })

  // A bare `"` in the query terminates the FTS5 string literal and turns the
  // rest of the query into syntax, which throws at the D1 boundary.
  it('neutralises quotes rather than emitting broken FTS5 syntax', () => {
    expect(buildFtsMatchQuery('vue "test')).toBe('"vue"* OR "test"*')
    expect(buildFtsMatchQuery('"')).toBeNull()
  })

  it('drops tokens that carry no matchable characters', () => {
    expect(buildFtsMatchQuery('vue -- ***')).toBe('"vue"*')
  })
})

describe('buildIdentifierFtsQuery', () => {
  // Migration 0087 put `description` in skills_fts. An unqualified MATCH
  // searches every column, so any curated surface keyed off one term would
  // silently widen (tag `testing`: 64 -> 247 matches). Search wants that
  // breadth; tag pages must not have it.
  it('restricts matching to identity columns, excluding description', () => {
    const query = buildIdentifierFtsQuery('testing')
    expect(query).toBe('{name owner repo display_name slug} : "testing"*')
    expect(query).not.toContain('description')
  })

  it('neutralises FTS syntax in the term', () => {
    expect(buildIdentifierFtsQuery('vue"')).toBe('{name owner repo display_name slug} : "vue"*')
  })

  it('returns null for a term with nothing matchable', () => {
    expect(buildIdentifierFtsQuery('')).toBeNull()
    expect(buildIdentifierFtsQuery('***')).toBeNull()
  })
})

describe('fuseRankings', () => {
  it('scores a single list by reciprocal rank', () => {
    const fused = fuseRankings([{ keys: ['a', 'b'], weight: 1 }])
    expect(fused.get('a')).toBeCloseTo(1 / (RRF_K + 1))
    expect(fused.get('b')).toBeCloseTo(1 / (RRF_K + 2))
  })

  // The defining property of RRF: agreement across retrievers beats a single
  // retriever's top pick. This is what stops one lane from dominating.
  it('ranks a hit found by both retrievers above a hit topping only one', () => {
    const fused = fuseRankings([
      { keys: ['solo', 'both'], weight: 1 },
      { keys: ['other', 'both'], weight: 1 },
    ])
    expect(fused.get('both')!).toBeGreaterThan(fused.get('solo')!)
    expect(fused.get('both')!).toBeGreaterThan(fused.get('other')!)
  })

  it('applies per-list weights', () => {
    const even = fuseRankings([{ keys: ['a'], weight: 1 }, { keys: ['b'], weight: 1 }])
    expect(even.get('a')).toBeCloseTo(even.get('b')!)

    const tilted = fuseRankings([{ keys: ['a'], weight: 2 }, { keys: ['b'], weight: 1 }])
    expect(tilted.get('a')!).toBeGreaterThan(tilted.get('b')!)
  })

  it('ignores empty lists so a dead retriever cannot skew the fusion', () => {
    const withDead = fuseRankings([{ keys: ['a', 'b'], weight: 1 }, { keys: [], weight: 1 }])
    const alone = fuseRankings([{ keys: ['a', 'b'], weight: 1 }])
    expect(withDead.get('a')).toBeCloseTo(alone.get('a')!)
  })
})

describe('collapseSearchDuplicates', () => {
  const sharedDescription = 'Use for Vue.js testing. Covers Vitest, Vue Test Utils, component testing patterns and mounting strategies for single file components.'
  const sharedContentHash = 'a'.repeat(64)

  it('collapses the same skill mirrored across repos into one canonical row', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'vuejs-ai', repo: 'skills', name: 'vue-testing-best-practices', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 2751 }),
      skill({ owner: 'antfu', repo: 'skills', name: 'vue-testing-best-practices', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 5700 }),
      skill({ owner: 'hyf0', repo: 'vue-skills', name: 'vue-testing-best-practices', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 2751 }),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]!.skill.owner).toBe('antfu')
    expect(collapsed[0]!.alternateSources).toHaveLength(2)
    expect(collapsed[0]!.alternateSources.map(s => s.owner).sort()).toEqual(['hyf0', 'vuejs-ai'])
  })

  // VISION anti-scope 4: popularity is context, never the primary ranking.
  // The mirrored copy we surface is the best-provenance one.
  it('picks the canonical copy by trust tier, not by popularity', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'popular-fork', repo: 'skills', name: 'vue-testing', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 90_000, trustTier: 'candidate' }),
      skill({ owner: 'author', repo: 'skills', name: 'vue-testing', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 12, trustTier: 'official' }),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]!.skill.owner).toBe('author')
    expect(collapsed[0]!.alternateSources[0]!.owner).toBe('popular-fork')
  })

  it('keeps genuinely distinct skills separate', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'a', repo: 'r', name: 'one', description: 'Completely different subject matter about parsing PDF documents end to end.' }),
      skill({ owner: 'b', repo: 'r', name: 'two', description: sharedDescription }),
    ])
    expect(collapsed).toHaveLength(2)
    expect(collapsed.every(g => g.alternateSources.length === 0)).toBe(true)
  })

  // Collapsing must not reshuffle relevance: the group inherits the best rank
  // any of its members held, so a canonical pick can never sink the group.
  it('preserves incoming rank order, using each group best position', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'top', repo: 'r', name: 'unique-a', description: 'A one-off skill about generating OpenAPI clients from a schema file.' }),
      skill({ owner: 'zz-weaker', repo: 'r', name: 'dupe', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 5 }),
      skill({ owner: 'aa-stronger', repo: 'r', name: 'dupe', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 900 }),
      skill({ owner: 'last', repo: 'r', name: 'unique-b', description: 'Another one-off skill covering Terraform module layout conventions.' }),
    ])

    // The group is emitted where its *first* member appeared (index 1), even
    // though the canonical pick is the member that appeared second.
    expect(collapsed.map(g => g.skill.owner)).toEqual(['top', 'aa-stronger', 'last'])
  })

  it('reports the total number of sources behind a collapsed row', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'a', repo: 'r', name: 'dupe', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 10 }),
      skill({ owner: 'b', repo: 'r', name: 'dupe', description: sharedDescription, renderedRawSha256: sharedContentHash, stars: 20 }),
    ])
    expect(collapsed[0]!.sourceCount).toBe(2)
  })

  it('keeps same-titled skills with different content separate', () => {
    const collapsed = collapseSearchDuplicates([
      skill({ owner: 'froq', repo: 'skills', name: 'vue-testing-best-practices', displayName: 'Vue Testing Best Practices', description: 'A reworded description that is comfortably past the grouping minimum length for descriptions.', renderedRawSha256: 'b'.repeat(64), trustTier: 'candidate' }),
      skill({ owner: 'antfu', repo: 'skills', name: 'vue-testing-best-practices', displayName: 'Vue Testing Best Practices', description: sharedDescription, renderedRawSha256: 'c'.repeat(64), trustTier: 'official' }),
    ])

    expect(collapsed.map(group => group.skill.owner)).toEqual(['froq', 'antfu'])
    expect(collapsed.every(group => group.sourceCount === 1 && group.alternateSources.length === 0)).toBe(true)
  })

  it('leaves an empty result set alone', () => {
    expect(collapseSearchDuplicates([])).toEqual([])
  })
})

describe('final search relevance', () => {
  it('keeps the strongest semantic match above an official distant neighbour', () => {
    const relevant = skill({ owner: 'author', repo: 'skills', name: 'retain-cycle-debugger' })
    const distant = skill({ owner: 'vendor', repo: 'skills', name: 'agent-memory', trustTier: 'official' })
    const keys = [skillKey(relevant), ...Array.from({ length: 48 }, (_, i) => `other/${i}`), skillKey(distant)]
    const scores = fuseRankings([{ keys, weight: 1 }])
    expect(rankSearchResults([distant, relevant], scores, 'stop leaking allocations')).toEqual([relevant, distant])
  })

  it.each(['pdf', 'PDF', '  pdf  ', 'author/skills/pdf'])('puts exact identity %s ahead of a fuzzy match in both lanes', (query) => {
    const exact = skill({ owner: 'author', repo: 'skills', name: 'pdf' })
    const fuzzy = skill({ owner: 'vendor', repo: 'skills', name: 'pdf-tools', trustTier: 'official' })
    const scores = fuseRankings([
      { keys: [skillKey(fuzzy), ...Array.from({ length: 198 }, (_, i) => `other/${i}`), skillKey(exact)], weight: 1.2 },
      { keys: [skillKey(fuzzy)], weight: 1 },
    ])
    expect(rankSearchResults([fuzzy, exact], scores, query)[0]).toEqual(exact)
  })

  it('uses provenance when relevance is equal', () => {
    const candidate = skill({ owner: 'a', repo: 'skills', name: 'one', stars: 10_000 })
    const official = skill({ owner: 'b', repo: 'skills', name: 'two', trustTier: 'official' })
    const scores = new Map([[skillKey(candidate), 0.01], [skillKey(official), 0.01]])
    expect(rankSearchResults([candidate, official], scores, 'task')).toEqual([official, candidate])
  })
})

describe('exact identity after duplicate collapse', () => {
  it.each(['pdf', 'requested/skills/pdf'])('keeps the requested identity %s when its content has an official mirror', (query) => {
    const requested = skill({ owner: 'requested', repo: 'skills', name: 'pdf', renderedRawSha256: 'd'.repeat(64) })
    const mirror = skill({ owner: 'vendor', repo: 'skills', name: 'document-tools', trustTier: 'official', renderedRawSha256: 'd'.repeat(64) })
    const ranked = rankSearchResults([mirror, requested], new Map(), query)
    const collapsed = collapseSearchDuplicates(ranked, query)
    expect(collapsed[0]?.skill).toEqual(requested)
    expect(collapsed[0]?.alternateSources).toEqual([{ owner: 'vendor', repo: 'skills', slug: 'vendor/document-tools' }])
    expect(collapsed[0]?.sourceCount).toBe(2)
  })
})

it('prefers provenance among equally exact Skill names', () => {
  const candidate = skill({ owner: 'copy', repo: 'skills', name: 'pdf' })
  const official = skill({ owner: 'author', repo: 'skills', name: 'pdf', trustTier: 'official' })
  const scores = new Map([[skillKey(candidate), 0.03], [skillKey(official), 0.01]])
  expect(rankSearchResults([candidate, official], scores, 'pdf')[0]).toEqual(official)
})

describe('query understanding signals', () => {
  const generic = skill({ owner: 'a', repo: 'skills', name: 'testing-guide', description: 'Write tests for any app.' })
  const vue = skill({ owner: 'b', repo: 'skills', name: 'component-tests', description: 'Test Vue 3 components with Vitest.' })
  const tied = new Map([[skillKey(generic), 0.03], [skillKey(vue), 0.0299]])

  it('lifts a Skill that mentions the framework the query named over a near tie', () => {
    expect(rankSearchResults([generic, vue], tied, 'test a vue app')).toEqual([generic, vue])
    expect(rankSearchResults([generic, vue], tied, 'test a vue app', { boostTerm: 'vue' })).toEqual([vue, generic])
  })

  it('lifts a Skill in the track the query asked for', () => {
    const categoryByKey = new Map([[skillKey(vue), 'testing'], [skillKey(generic), null]])
    expect(rankSearchResults([generic, vue], tied, 'q', { boostCategories: ['testing'], categoryByKey })).toEqual([vue, generic])
  })

  it('never lifts a signal match over a clearly better retrieval score', () => {
    const scores = new Map([[skillKey(generic), 0.033], [skillKey(vue), 0.016]])
    expect(rankSearchResults([vue, generic], scores, 'q', { boostTerm: 'vue', boostCategories: ['testing'], categoryByKey: new Map([[skillKey(vue), 'testing']]) })).toEqual([generic, vue])
  })

  it('puts a Skill named by the grounded terms in the name tier, so a typo still finds it', () => {
    const hooks = skill({ owner: 'c', repo: 'skills', name: 'react-hooks' })
    const other = skill({ owner: 'd', repo: 'skills', name: 'hook-creator' })
    const scores = new Map([[skillKey(other), 0.05], [skillKey(hooks), 0.01]])
    expect(rankSearchResults([other, hooks], scores, 'reacct hooks', { expansion: 'react hooks', nameTerms: 'react hooks' })[0]).toEqual(hooks)
  })

  it('keeps a Skill named only by the paraphrase out of the name tier', () => {
    const generic = skill({ owner: 'e', repo: 'skills', name: 'ui-design' })
    const asked = skill({ owner: 'f', repo: 'skills', name: 'make-interfaces-feel-better' })
    const scores = new Map([[skillKey(asked), 0.05], [skillKey(generic), 0.01]])
    expect(rankSearchResults([generic, asked], scores, 'make my ui less generic', { expansion: 'ui design distinctive', nameTerms: 'ui' })[0]).toEqual(asked)
  })
})
