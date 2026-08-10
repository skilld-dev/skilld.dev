/**
 * Cluster grid data for the homepage.
 *
 * Returns one row per cluster with skillCount and top example skills. Pinned
 * examples lead, followed by canonical GitHub star ranking. All sourced from
 * `skills` joined to `skill_generated(kind='abstractness')` filtered to
 * `payload.kind = 'abstract'`.
 */

import type { Cluster } from '../../data/clusters'
import { getDB } from '#server/utils/db'
import { CLUSTERS } from '../../data/clusters'

interface SkillRow {
  owner: string
  name: string
  repo: string
  display_name: string
  stars: number
  category: string
}

export interface ClusterCard {
  slug: string
  label: string
  icon: string
  userVoice: string
  skillCount: number
  authorCount: number
  /** Distinct GitHub logins behind the cluster, most-starred first. */
  authors: string[]
  examples: { owner: string, name: string, repo: string, displayName: string, stars: number }[]
}

const EXAMPLES_PER_CARD = 5
const AUTHORS_PER_CARD = 5

export default defineCachedEventHandler(async (event) => {
  const db = getDB(event)

  const allCategories = Array.from(new Set(CLUSTERS.flatMap(c => c.categories)))
  if (!allCategories.length)
    return { items: [] }

  const placeholders = allCategories.map(() => '?').join(',')
  const sql = `
    SELECT s.owner, s.name, s.repo, s.display_name, r.stars,
           s.abstractness_category AS category
    FROM skills s
    JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
    WHERE s.is_abstract = 1
      AND s.abstractness_category IN (${placeholders})
  `
  const res = await db.prepare(sql).bind(...allCategories).all<SkillRow>()
  const rows = res.results ?? []

  const byKey = new Map<string, SkillRow>()
  for (const r of rows) byKey.set(`${r.owner}/${r.name}`, r)

  const items: ClusterCard[] = CLUSTERS.map((c: Cluster) => {
    const inCluster = rows.filter(r => c.categories.includes(r.category))

    const pinned: SkillRow[] = []
    const seen = new Set<string>()
    for (const key of c.pinnedExamples) {
      const r = byKey.get(key)
      if (r && c.categories.includes(r.category)) {
        pinned.push(r)
        seen.add(key)
      }
    }
    const remaining = inCluster
      .filter(r => !seen.has(`${r.owner}/${r.name}`))
      .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))

    const examples = [...pinned, ...remaining].slice(0, EXAMPLES_PER_CARD)

    // Avatars answer "who writes this kind of skill", so they rank by the
    // author's reach rather than by whichever example happened to be pinned.
    const authors: string[] = []
    const byStars = [...inCluster].sort((a, b) => b.stars - a.stars || a.owner.localeCompare(b.owner))
    for (const row of byStars) {
      if (!authors.includes(row.owner))
        authors.push(row.owner)
    }

    return {
      slug: c.slug,
      label: c.label,
      icon: c.icon,
      userVoice: c.userVoice,
      skillCount: inCluster.length,
      authorCount: authors.length,
      authors: authors.slice(0, AUTHORS_PER_CARD),
      examples: examples.map(e => ({
        owner: e.owner,
        name: e.name,
        repo: e.repo,
        displayName: e.display_name,
        stars: e.stars,
      })),
    }
  })

  // An empty track is a dead end for the visitor who picks it, so the grid
  // only carries tracks that have something behind them. The pages stay live.
  const populated = items
    .filter(item => item.skillCount > 0)
    .sort((a, b) => b.skillCount - a.skillCount)

  return { items: populated }
}, {
  maxAge: 60,
  swr: false,
  name: 'clusters-index-origin-v2',
})
