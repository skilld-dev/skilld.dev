/**
 * Recent publishes feed: skills newly indexed by the GitHub sync task.
 * Reads from the materialized activity table, joined to skills for display fields.
 * Empty until sync-github-skills has run at least once.
 */

import { getDB } from '../../utils/db'

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
  }>
}

export default defineCachedEventHandler(
  async (event): Promise<RecentPublishesResponse> => {
    const db = getDB(event)
    const res = await db
      .prepare(
        `SELECT a.owner, a.name, a.occurred_at, a.sha,
                s.display_name, s.repo, s.description, s.slug, s.sync_status
         FROM activity a
         LEFT JOIN skills s ON s.owner = a.owner AND s.name = a.name
         WHERE a.type = 'skill_published'
         ORDER BY a.occurred_at DESC
         LIMIT 12`,
      )
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
    }))
    return { items }
  },
  { maxAge: 60, swr: true, name: 'feed-recent-publishes' },
)
