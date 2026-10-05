/**
 * Recent publishes feed: skills newly indexed by the GitHub sync task.
 * Reads from the materialized activity table, joined to skills for display fields.
 * Filtered to official owners (orgs + users) so the homepage feed stays curated.
 * Empty until sync-github-skills has run at least once.
 */

import { officialRepos } from '#layers/registry/server/data/official-repos'
import { getDB } from '#server/utils/db'
import { cachedFeed } from '#server/utils/feed-cache'
import { canonicalRepoSkillPath } from '#shared/skill-routes'
import { buildOfficialOwnerFilter } from '../../utils/recent-publishes-query'

const officialOwnerFilter = buildOfficialOwnerFilter(officialRepos.map(r => r.owner))

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
  repo_skill_count: number
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
    registryPath: string
  }>
}

export default defineEventHandler(
  async (event): Promise<RecentPublishesResponse> => cachedFeed(event, 'recent-publishes', async () => {
    const db = getDB(event)
    const res = await db
      .prepare(
        `SELECT a.owner, a.name, a.occurred_at, a.sha,
                s.display_name, s.repo, s.description, s.slug, s.sync_status,
                r.stars,
                (SELECT COUNT(*) FROM skills repo_skills
                 WHERE repo_skills.owner = s.owner
                   AND repo_skills.repo = s.repo
                   AND repo_skills.source_resolved = 1) AS repo_skill_count
         FROM activity a
         -- INNER, not LEFT. An activity row whose skill has since been
         -- deleted used to survive the join, and the fallbacks below then
         -- invented a repo name for it, so the feed linked to a page that
         -- does not exist. recent-updates.get.ts already joins this way.
         JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
         JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
         WHERE a.type = 'skill_published'
           AND ${officialOwnerFilter.sql}
         ORDER BY a.occurred_at DESC
         LIMIT 12`,
      )
      .bind(...officialOwnerFilter.params)
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
      registryPath: canonicalRepoSkillPath({
        owner: row.owner,
        repo: row.repo ?? 'skills',
        name: row.name,
        repoSkillCount: row.repo_skill_count,
      }),
    }))
    return { items }
  }),
)
