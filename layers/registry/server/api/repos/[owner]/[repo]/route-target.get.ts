import type { RepoRouteTarget } from '../../../../utils/repo-route-target'
import { getDB } from '#server/utils/db'
import { resolveRepoRouteTarget } from '../../../../utils/repo-route-target'

export interface RepoRouteResolution {
  owner: string
  repo: string
  target: RepoRouteTarget
}

export default defineEventHandler(async (event) => {
  const owner = getRouterParam(event, 'owner')?.toLowerCase()
  const repo = getRouterParam(event, 'repo')?.toLowerCase()
  if (!owner || !repo)
    throw createError({ statusCode: 400, statusMessage: 'Owner and repository are required' })

  const indexedSkills = await getDB(event)
    .prepare(
      `SELECT name
       FROM skills
       WHERE owner = ?
         AND repo = ?
         AND source_resolved = 1
       ORDER BY name
       LIMIT 2`,
    )
    .bind(owner, repo)
    .all<{ name: string }>()

  return {
    owner,
    repo,
    target: resolveRepoRouteTarget((indexedSkills.results ?? []).map(row => row.name)),
  } satisfies RepoRouteResolution
})
