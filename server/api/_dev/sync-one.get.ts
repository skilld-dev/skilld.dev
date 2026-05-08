/**
 * DEV-ONLY one-shot sync trigger. Invoke with:
 *   curl 'http://localhost:3000/api/_dev/sync-one?owner=anthropics&repo=skills'
 * Returns the SyncRepoStats so we can see what landed.
 */

import { resolveGithubBindings } from '~~/layers/registry/server/utils/github-client'
import { syncRepo } from '~~/layers/registry/server/utils/sync-repo'
import { getDB } from '../../utils/db'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production')
    throw createError({ statusCode: 404 })

  const owner = getQuery(event).owner as string | undefined
  const repo = getQuery(event).repo as string | undefined
  if (!owner || !repo)
    throw createError({ statusCode: 400, message: 'owner + repo query params required' })

  const db = getDB(event)
  const env = (event.context.cloudflare?.env ?? {}) as Record<string, unknown>
  const bindings = resolveGithubBindings(env)
  return syncRepo(owner, repo, bindings, db)
})
