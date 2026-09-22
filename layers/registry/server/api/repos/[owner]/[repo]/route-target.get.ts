import type { RepoRouteTarget } from '../../../../utils/repo-route-target'
import { getDB } from '#server/utils/db'
import { scheduleAutoIndexMissingRepository } from '../../../../utils/auto-index-repository'
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

  const names = (indexedSkills.results ?? []).map(row => row.name)

  // Every `/gh/:owner/:repo` view asks this route first, and no skill rows
  // means the registry has never seen the repository. Ask for it to be
  // indexed, then answer with what is known now. The trigger runs after the
  // response and cannot change it.
  if (names.length === 0)
    scheduleAutoIndexMissingRepository(event, { owner, repo })

  return {
    owner,
    repo,
    target: resolveRepoRouteTarget(names),
  } satisfies RepoRouteResolution
})
