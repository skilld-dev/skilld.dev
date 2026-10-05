import { describe, expect, it } from 'vitest'
import { CLUSTERS, FRAMEWORK_PINNED_SKILLS, isCategoryPinned } from '../../layers/registry/server/data/clusters'
import { parseClusterSkillKeys } from '../../layers/registry/server/utils/cluster-skill-curation'
import { scoreSkillIndexability, SEO_INDEXABLE_MIN_SCORE } from '../../layers/registry/server/utils/skill-indexability'

/**
 * The 2026-08-12 rework moved Harlan's collections into category pins.
 * `curator_reason_count` only counts rows in collections with
 * `deleted_at IS NULL`, so retiring those collections strips the primary trust
 * signal from every skill in them. A pin has to carry the same weight, or the
 * merge silently deindexes the exact skills it was meant to promote.
 */

function baseInput() {
  return {
    isOfficial: false,
    ownerVerified: false,
    sourceResolved: true,
    trustTier: 'community' as const,
    curatorCount: 0,
    curatorReasonCount: 0,
    categoryPinned: false,
    approvedSocialCount: 0,
    authorSocialCount: 0,
    stars: 10,
    pushedAt: null,
    referencesCount: 0,
    description: 'A skill that does a thing.',
    repoSkillCount: 3,
  }
}

describe('category pin indexability', () => {
  it('makes a pin a primary trust signal, like a collection reason', () => {
    const unpinned = scoreSkillIndexability(baseInput())
    const pinned = scoreSkillIndexability({ ...baseInput(), categoryPinned: true })

    expect(unpinned.indexable).toBe(false)
    expect(unpinned.reasons).toContain('no_primary_trust_signal')

    expect(pinned.indexable).toBe(true)
    expect(pinned.reasons).toContain('category_pinned')
    expect(pinned.score).toBeGreaterThanOrEqual(SEO_INDEXABLE_MIN_SCORE)
  })

  it('scores a pin the same as a collection reason, and never stacks the two', () => {
    const byReason = scoreSkillIndexability({ ...baseInput(), curatorReasonCount: 1 })
    const byPin = scoreSkillIndexability({ ...baseInput(), categoryPinned: true })
    const both = scoreSkillIndexability({
      ...baseInput(),
      curatorReasonCount: 1,
      categoryPinned: true,
    })

    expect(byPin.score).toBe(byReason.score)
    // Double-counting would let a pinned+curated skill outrank an official one
    // on curation alone, which is not a judgement anyone made.
    expect(both.score).toBe(byReason.score)
    expect(both.reasons).toContain('curator_reason')
    expect(both.reasons).not.toContain('category_pinned')
  })

  it('still refuses a pinned skill with no resolvable source', () => {
    // A pin is a curation call, not a repair. If the SKILL.md cannot be
    // resolved there is nothing to index.
    const broken = scoreSkillIndexability({
      ...baseInput(),
      categoryPinned: true,
      sourceResolved: false,
    })

    expect(broken.indexable).toBe(false)
  })

  it('still refuses a pinned skill with no description', () => {
    const noDescription = scoreSkillIndexability({
      ...baseInput(),
      categoryPinned: true,
      description: null,
    })

    expect(noDescription.indexable).toBe(false)
  })

  it('exposes every pin through one lookup the recompute and sitemap share', () => {
    const pins = parseClusterSkillKeys([...CLUSTERS.flatMap(cluster => cluster.pinnedExamples), ...FRAMEWORK_PINNED_SKILLS])
    for (const { key, owner, repo, name } of pins)
      expect(isCategoryPinned(owner, repo, name), key).toBe(true)
    expect(isCategoryPinned('nobody', 'skills', 'not-a-skill')).toBe(false)
  })

  it('gives the pin to one Skill, not a namesake in another repository', () => {
    // `emilkowalski/skill` is the registry identity of `emilkowalski/skills`
    // before a rename. The pin names the canonical one.
    expect(isCategoryPinned('emilkowalski', 'skills', 'emil-design-eng')).toBe(true)
    expect(isCategoryPinned('emilkowalski', 'skill', 'emil-design-eng')).toBe(false)
  })
})
