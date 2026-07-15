/**
 * Cluster grid data for the homepage.
 *
 * Returns one row per cluster with skillCount, totalInstalls, and the top
 * example skills (pinned + install-ranked fallbacks). All sourced from
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
  installs: number
  category: string
}

export interface ClusterCard {
  slug: string
  label: string
  icon: string
  userVoice: string
  skillCount: number
  totalInstalls: number
  examples: { owner: string, name: string, repo: string, displayName: string, installs: number }[]
}

const EXAMPLES_PER_CARD = 5

export default defineCachedEventHandler(async (event) => {
  const db = getDB(event)

  const allCategories = Array.from(new Set(CLUSTERS.flatMap(c => c.categories)))
  if (!allCategories.length)
    return { items: [] }

  const placeholders = allCategories.map(() => '?').join(',')
  const sql = `
    SELECT owner, name, repo, display_name, installs,
           abstractness_category AS category
    FROM skills
    WHERE is_abstract = 1
      AND abstractness_category IN (${placeholders})
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
      .sort((a, b) => b.installs - a.installs)

    const examples = [...pinned, ...remaining].slice(0, EXAMPLES_PER_CARD)
    const totalInstalls = inCluster.reduce((s, r) => s + (r.installs || 0), 0)

    return {
      slug: c.slug,
      label: c.label,
      icon: c.icon,
      userVoice: c.userVoice,
      skillCount: inCluster.length,
      totalInstalls,
      examples: examples.map(e => ({
        owner: e.owner,
        name: e.name,
        repo: e.repo,
        displayName: e.display_name,
        installs: e.installs,
      })),
    }
  })

  return { items }
}, {
  maxAge: 60 * 10,
  swr: true,
})
