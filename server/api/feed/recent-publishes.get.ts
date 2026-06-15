/**
 * Recent publishes feed: skills newly indexed by the GitHub sync task.
 * Reads from the materialized activity table, joined to skills for display fields.
 * Filtered to official owners (orgs + users) so the homepage feed stays curated.
 * Empty until sync-github-skills has run at least once.
 */

import { officialRepos } from '#layers/registry/server/data/official-repos'
import { getDB } from '../../../shared/server/db'

const officialOwners = officialRepos.map(r => r.owner)

interface FeedRow {
  owner: string
  name: string
  occurred_at: number
  sha: string
  display_name: string | null
  repo: string | null
  description: string | null
  slug: string | null
  sync_status: string | null
  stars: number | null
  installs: number | null
}

export interface RecentPublishesResponse {
  items: Array<{
    owner: string
    name: string
    displayName: string
    repo: string
    description: string | null
    slug: string
    sha: string
    occurredAt: number
    hasReceipts: boolean
    stars: number
    installs: number
  }>
}

export default defineCachedEventHandler(
  async (event): Promise<RecentPublishesResponse> => {
    const db = getDB(event)
    const placeholders = officialOwners.map(() => '?').join(',')
    const res = await db
      .prepare(
        `SELECT a.owner, a.name, a.occurred_at, a.sha,
                s.display_name, s.repo, s.description, s.slug, s.sync_status,
                r.stars, s.installs
         FROM activity a
         LEFT JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
         LEFT JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
         WHERE a.type = 'skill_published'
           AND a.owner IN (${placeholders})
         ORDER BY a.occurred_at DESC
         LIMIT 12`,
      )
      .bind(...officialOwners)
      .all<FeedRow>()
    const items = (res.results ?? []).map(row => ({
      owner: row.owner,
      name: row.name,
      displayName: row.display_name ?? row.name,
      repo: row.repo ?? 'skills',
      description: row.description,
      slug: row.slug ?? `${row.owner}/${row.name}`,
      sha: row.sha,
      occurredAt: row.occurred_at,
      hasReceipts: row.sync_status === 'ok',
      stars: row.stars ?? 0,
      installs: row.installs ?? 0,
    }))
    return { items }
  },
  { maxAge: 60, swr: true, name: 'feed-recent-publishes' },
)
