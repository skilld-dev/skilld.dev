// nameMatchBoost layers a lexical signal on top of Vectorize cosine scores so
// exact / substring name matches stay pinned above fuzzy semantic neighbours.
// Cosine scores sit ~0.2-0.9, so the boost tiers (exact 1.0, substring 0.4,
// partial-token up to 0.25) are calibrated to reorder within that band.

import { describe, expect, it } from 'vitest'
import { nameMatchBoost } from '../../layers/registry/server/utils/skill-semantic-search'

const skill = (name: string, displayName = name, slug = name) => ({ name, displayName, slug })

describe('nameMatchBoost', () => {
  it('returns the max boost for an exact name/slug/display match', () => {
    expect(nameMatchBoost(skill('grill-me'), 'grill-me')).toBe(1)
    expect(nameMatchBoost(skill('grill-me', 'Grill Me'), 'grill me')).toBe(1)
  })

  it('strongly boosts a full-query substring match', () => {
    expect(nameMatchBoost(skill('grill-with-docs'), 'with-docs')).toBe(0.4)
  })

  it('partially boosts on token overlap, proportional to matched terms', () => {
    // 2 of 3 query terms ("with", "docs") appear in "grill-with-docs".
    expect(nameMatchBoost(skill('grill-with-docs'), 'plan with docs')).toBeCloseTo(0.25 * (2 / 3))
  })

  it('does not boost when no term matches the name', () => {
    expect(nameMatchBoost(skill('grill-with-docs'), 'kubernetes deploy')).toBe(0)
  })

  it('is case-insensitive and ignores surrounding whitespace', () => {
    // "with-docs" (hyphen) is a real substring; "with docs" (space) is not, and
    // correctly degrades to the token-overlap tier.
    expect(nameMatchBoost(skill('grill-with-docs'), '  WITH-DOCS  ')).toBe(0.4)
    expect(nameMatchBoost(skill('grill-with-docs'), 'WITH DOCS')).toBeCloseTo(0.25)
  })

  it('returns 0 for an empty query', () => {
    expect(nameMatchBoost(skill('grill-with-docs'), '   ')).toBe(0)
  })

  it('keeps an exact match (1.0) ahead of a partial match once added to cosine', () => {
    // grill-me cosine ~0.55 + exact 1.0 vs grill-with-docs cosine ~0.62 + 0.167
    expect(0.55 + nameMatchBoost(skill('grill-me'), 'grill-me'))
      .toBeGreaterThan(0.62 + nameMatchBoost(skill('grill-with-docs'), 'grill-me'))
  })
})
