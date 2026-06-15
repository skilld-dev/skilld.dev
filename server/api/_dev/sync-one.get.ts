import { z } from 'zod'
import { resolveGithubBindings } from '#layers/registry/server/utils/github-client'
import { syncRepo } from '#layers/registry/server/utils/sync-repo'
import { defineApiHandler } from '#shared/server/handler'

const SyncOneQuery = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
})

export default defineApiHandler({
  schema: SyncOneQuery,
  handler: async ({ body, platform }) => {
    if (process.env.NODE_ENV === 'production')
      throw createError({ statusCode: 404 })
    const bindings = resolveGithubBindings(platform.env)
    return syncRepo(body.owner, body.repo, bindings, platform.db)
  },
})
