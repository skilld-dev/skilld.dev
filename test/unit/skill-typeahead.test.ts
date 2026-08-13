import type { TypeaheadTuple } from '../../app/utils/skill-typeahead'
import { describe, expect, it } from 'vitest'
import { matchTypeahead } from '../../app/utils/skill-typeahead'

// Trailing value is canonical GitHub stars, the ranking evidence.
const INDEX: TypeaheadTuple[] = [
  ['vue-testing-best-practices', 'antfu', 'skills', 5700],
  ['vue', 'onmax', 'nuxt-skills', 1774],
  ['vue', 'antfu', 'skills', 900],
  ['vueuse', 'antfu', 'skills', 500],
  ['nuxt-ui', 'onmax', 'nuxt-skills', 2000],
  ['pdf', 'anthropics', 'skills', 8000],
]

describe('matchTypeahead', () => {
  it('returns nothing for an empty query', () => {
    expect(matchTypeahead(INDEX, '')).toEqual([])
    expect(matchTypeahead(INDEX, '   ')).toEqual([])
  })

  it('ranks an exact name match above a longer prefix match', () => {
    const hits = matchTypeahead(INDEX, 'vue')
    expect(hits[0]!.name).toBe('vue')
    expect(hits[1]!.name).toBe('vue')
  })

  it('breaks ties within a tier by GitHub stars', () => {
    const hits = matchTypeahead(INDEX, 'vue')
    expect(hits[0]!.owner).toBe('onmax')
    expect(hits[1]!.owner).toBe('antfu')
  })

  it('matches an owner prefix', () => {
    const hits = matchTypeahead(INDEX, 'onmax')
    expect(hits.every(h => h.owner === 'onmax')).toBe(true)
    expect(hits).toHaveLength(2)
  })

  it('matches inside a repo name', () => {
    const hits = matchTypeahead(INDEX, 'nuxt-skills')
    expect(hits.map(h => h.repo)).toEqual(['nuxt-skills', 'nuxt-skills'])
  })

  it('is case insensitive in both directions', () => {
    expect(matchTypeahead(INDEX, 'VUE')[0]!.name).toBe('vue')
    expect(matchTypeahead([['PDF', 'Anthropics', 'Skills', 1]], 'pdf')).toHaveLength(1)
  })

  it('honours the limit', () => {
    expect(matchTypeahead(INDEX, 'vue', 2)).toHaveLength(2)
  })

  // Identifier matching cannot serve prose. Returning nothing here is correct;
  // the panel must fall through to server results rather than say "no matches".
  it('returns nothing for a task-shaped query', () => {
    expect(matchTypeahead(INDEX, 'debug a flaky test')).toEqual([])
  })

  it('ranks a name prefix above an owner prefix', () => {
    const hits = matchTypeahead([
      ['something', 'vuejs', 'skills', 9999],
      ['vue-router', 'someone', 'skills', 1],
    ], 'vue')
    expect(hits[0]!.name).toBe('vue-router')
  })
})
