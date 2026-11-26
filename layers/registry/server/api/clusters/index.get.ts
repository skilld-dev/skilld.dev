/**
 * Cluster grid data for the homepage.
 *
 * Returns one row per cluster with skillCount and top example skills. Pinned
 * examples lead, followed by canonical GitHub star ranking. A pinned example
 * overrides the generated category because it records a human curation call.
 */

import type { Cluster } from '../../data/clusters'
import { defineEventHandler, setHeader } from 'h3'
import { getDB } from '#server/utils/db'
import { cached } from '#shared/server/cache'
import { CLUSTERS } from '../../data/clusters'
import { runAfterResponse } from '../../utils/after-response'
import { findClusterIndexRows } from '../../utils/cluster-index-rows'
import { clusterMembersSql } from '../../utils/cluster-membership'
import { clusterSkillKey, curateClusterSkills, parseClusterSkillKeys } from '../../utils/cluster-skill-curation'

interface SkillRow {
  owner: string
  name: string
  repo: string
  display_name: string
  stars: number
  category: string | null
  is_abstract: number
}

const COLUMNS = 'owner, name, repo, display_name, stars, category, is_abstract'

export interface ClusterCard {
  slug: string
  label: string
  icon: string
  userVoice: string
  skillCount: number
  authorCount: number
  /** Distinct GitHub logins behind the cluster, most-starred first. */
  authors: string[]
  /** Admitted inside the last 45 days, so the grid can mark it. */
  isNew: boolean
  examples: { owner: string, name: string, repo: string, displayName: string, stars: number }[]
}

const EXAMPLES_PER_CARD = 5
/**
 * How long a track reads as new. Long enough that a monthly visitor sees it,
 * short enough that "new" keeps meaning something.
 */
const NEW_TRACK_DAYS = 45
const AUTHORS_PER_CARD = 8

const CLUSTERS_INDEX_CACHE_KEY = 'clusters:index:v7'
const CLUSTERS_INDEX_TTL_SECONDS = 60 * 60
const CLUSTERS_INDEX_STALE_SECONDS = 60 * 60 * 24
const ISOLATE_CACHE_MS = 60_000
let isolateCache: { value: { items: ClusterCard[] }, expiresAt: number } | null = null

// Membership changes only when a sync or classifier writes skills, and the
// category query reads ~53K rows. Use `cached` over the global KV `cache`
// mount with in-isolate refresh claiming + 60s isolate memory cache instead of
// bare `defineCachedEventHandler`, which missed concurrently on 10m expiry.
export default defineEventHandler(async (event): Promise<{ items: ClusterCard[] }> => {
  setHeader(event, 'cloudflare-cdn-cache-control', 'public, max-age=600, stale-while-revalidate=3600')
  const now = Date.now()
  if (isolateCache && isolateCache.expiresAt > now)
    return isolateCache.value

  const value = await cached<{ items: ClusterCard[] }>({
    storage: useStorage('cache'),
    key: CLUSTERS_INDEX_CACHE_KEY,
    ttlSeconds: CLUSTERS_INDEX_TTL_SECONDS,
    staleSeconds: CLUSTERS_INDEX_STALE_SECONDS,
    schedule: promise => runAfterResponse(event, promise),
    compute: async () => {
      const db = getDB(event)
      const newestAdmissionCutoff = Date.now() - NEW_TRACK_DAYS * 24 * 60 * 60 * 1000

      const allCategories = Array.from(new Set(CLUSTERS.flatMap(c => c.categories)))
      if (!allCategories.length)
        return { items: [] }

      const allPinnedExamples = parseClusterSkillKeys(
        Array.from(new Set(CLUSTERS.flatMap(c => c.pinnedExamples))),
      ).map(skill => skill.key)
      const rows = await findClusterIndexRows(async (selector, values) => {
        const { sql, params } = selector === 'category'
          ? clusterMembersSql(COLUMNS, values, [])
          : clusterMembersSql(COLUMNS, [], values)
        const result = await db.prepare(sql).bind(...params).all<SkillRow>()

        return result.results ?? []
      }, allCategories, allPinnedExamples)

      const items: ClusterCard[] = CLUSTERS.map((c: Cluster) => {
        const pinned = new Set(c.pinnedExamples)
        const inCluster = rows
          .filter(r => (r.category !== null && c.categories.includes(r.category)) || pinned.has(clusterSkillKey(r)))
          // Abstract skills lead the card: they are the classified curation signal,
          // and the backfill exists so the track has depth under them.
          .sort((a, b) => b.is_abstract - a.is_abstract || b.stars - a.stars || a.name.localeCompare(b.name))
        const examples = curateClusterSkills(inCluster, c.pinnedExamples).slice(0, EXAMPLES_PER_CARD)

        // Avatars answer "who writes this kind of skill", so they rank by the
        // author's reach rather than by whichever example happened to be pinned.
        // Abstract-first here too, or the backfill hands every track the same
        // handful of vendor avatars.
        const authors: string[] = []
        const byStars = [...inCluster].sort((a, b) => b.is_abstract - a.is_abstract || b.stars - a.stars || a.owner.localeCompare(b.owner))
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
          isNew: c.addedAt !== null && Date.parse(c.addedAt) >= newestAdmissionCutoff,
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
    },
  })
  isolateCache = { value, expiresAt: now + ISOLATE_CACHE_MS }
  return value
})
