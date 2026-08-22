import { describe, expect, it } from 'vitest'
import { CLUSTERS, MERGED_COLLECTIONS, RENAMED_CLUSTER_SLUGS } from '../../layers/registry/server/data/clusters'
import { TAXONOMY } from '../../layers/registry/server/jobs/taxonomy'
import { ABSTRACTNESS_CATEGORIES } from '../../layers/registry/server/utils/ai-prompts'
import { getTagRedirect, MARKETING_REDIRECTS } from '../../layers/registry/server/utils/tag-quality'

/**
 * The category taxonomy filters skills by `skills.abstractness_category`, which
 * only ever holds a value from ABSTRACTNESS_CATEGORIES. Before the 2026-08-12
 * rework, nine cluster categories (`agent-meta`, `docs-writing`, `refactor`,
 * `git-workflow`, ...) were values the classifier never emits, so those tracks
 * matched nothing but their pinned examples and nobody noticed. A typo in a
 * string array cannot fail loudly on its own, so it fails here instead.
 */
describe('cluster taxonomy', () => {
  it('only filters on categories the classifier actually emits', () => {
    const valid = new Set<string>(ABSTRACTNESS_CATEGORIES)
    const unknown = CLUSTERS.flatMap(cluster =>
      cluster.categories
        .filter(category => !valid.has(category))
        .map(category => `${cluster.slug}: ${category}`),
    )

    expect(unknown).toEqual([])
  })

  it('never assigns one classifier category to two categories', () => {
    // Two categories claiming the same value double-count the same skills
    // across the homepage grid, which makes the counts a lie.
    const owners = new Map<string, string>()
    const collisions: string[] = []

    for (const cluster of CLUSTERS) {
      for (const category of cluster.categories) {
        const existing = owners.get(category)
        if (existing)
          collisions.push(`${category}: ${existing} + ${cluster.slug}`)
        else
          owners.set(category, cluster.slug)
      }
    }

    expect(collisions).toEqual([])
  })

  it('gives every category a unique slug', () => {
    const slugs = CLUSTERS.map(cluster => cluster.slug)

    expect(slugs).toHaveLength(new Set(slugs).size)
  })

  it('carries a keyword-shaped title distinct from the editorial label', () => {
    for (const cluster of CLUSTERS) {
      expect(cluster.seoTitle.length, cluster.slug).toBeGreaterThan(0)
      // The <title> exists to catch `claude skills for <domain>` demand. If it
      // is just the H1 again, the rework has been undone for that row.
      expect(cluster.seoTitle, cluster.slug).not.toBe(cluster.label)
      expect(cluster.seoDescription.length, cluster.slug).toBeGreaterThan(50)
    }
  })

  it('maps each retired collection to exactly one category', () => {
    const merged = CLUSTERS.filter(cluster => cluster.mergedFrom)

    // A collection merged into two categories would leave its redirect
    // ambiguous, and MERGED_COLLECTIONS would silently drop one of them.
    expect(Object.keys(MERGED_COLLECTIONS)).toHaveLength(merged.length)

    for (const cluster of merged)
      expect(MERGED_COLLECTIONS[cluster.mergedFrom!]).toBe(cluster.slug)
  })

  it('keeps the non-developer demand test separable', () => {
    // The `test` rows were admitted against VISION's north-star user on
    // 2026-08-12. `marketing` and `research` were culled on 2026-08-13, and
    // `writing` retired into the dev-facing `anti-slop` on 2026-08-22.
    // Reversing the rest must stay a one-row delete, so nothing
    // developer-facing may depend on it.
    const testAudience = CLUSTERS.filter(cluster => cluster.audience === 'test')

    expect(testAudience.map(cluster => cluster.slug)).toEqual([
      'seo',
    ])
    for (const cluster of testAudience)
      expect(cluster.mergedFrom, cluster.slug).toBeNull()
  })

  it('points every rename at a category that exists', () => {
    // A rename whose target was later renamed again would 301 into a 404.
    const slugs = new Set(CLUSTERS.map(cluster => cluster.slug))

    for (const [from, to] of Object.entries(RENAMED_CLUSTER_SLUGS)) {
      expect(slugs.has(to), `${from} -> ${to}`).toBe(true)
      expect(slugs.has(from), `${from} is renamed, so it cannot still be live`).toBe(false)
    }
  })

  it('never leaves a tag page live at the same slug as a category', () => {
    // `/skills/tag/design` and `/skills/design` listing the same skills for the
    // same query splits the signal and reads as scaled content, which is what
    // suppressed the site in 2026-06. An exact slug collision is always that
    // bug; a tag that is genuinely broader keeps its own page and simply does
    // not share a slug.
    const categories = new Set(CLUSTERS.map(cluster => cluster.slug))
    const collisions = TAXONOMY
      .map(tag => tag.slug)
      .filter(slug => categories.has(slug) && !getTagRedirect(slug))

    expect(collisions).toEqual([])
  })

  it('points every tag redirect at a live destination', () => {
    const categories = new Set(CLUSTERS.map(cluster => cluster.slug))

    for (const [tag, target] of Object.entries(MARKETING_REDIRECTS)) {
      if (!target.startsWith('/skills/'))
        continue // framework pages are real routes, not categories
      expect(categories.has(target.slice('/skills/'.length)), `${tag} -> ${target}`).toBe(true)
    }
  })

  it('pins examples as owner/name keys, never owner/repo/name', () => {
    // The detail query matches `s.owner || '/' || s.name`, so a three-segment
    // key silently pins nothing.
    for (const cluster of CLUSTERS) {
      for (const key of cluster.pinnedExamples)
        expect(key.split('/'), `${cluster.slug}: ${key}`).toHaveLength(2)
    }
  })
})
