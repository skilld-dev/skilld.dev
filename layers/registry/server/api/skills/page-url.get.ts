import { setHeader } from 'h3'
import { z } from 'zod'
import { cached } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { runAfterResponse } from '../../utils/after-response'
import { findSkillPagePath, skillPageCacheKey } from '../../utils/skill-page-url'

const PAGE_URL_TTL = 60 * 5
const PAGE_URL_STALE_TTL = 60 * 60

const PageUrlQuery = z.object({
  owner: z.string().min(1).max(39).regex(/^[a-z0-9-]+$/i),
  repo: z.string().min(1).max(100).regex(/^[\w.-]+$/),
  path: z.string().min(1).max(1024),
}).strict()

const PageUrlResponse = z.object({
  pageUrl: z.string().url().nullable(),
}).strict()

/**
 * The absolute canonical page of the Skill at one repository path, or null.
 *
 * Artifact delivery reads this over HTTP so it can tell the CLI which Skills
 * have a page. Delivery resolves any public GitHub repository, so a null is
 * common and cached like a hit. The cached read keeps the D1 lookup off the
 * per-request path of `skilld run`.
 */
export default defineApiHandler({
  schema: PageUrlQuery,
  response: PageUrlResponse,
  handler: async ({ event, body, platform }) => {
    setHeader(event, 'cache-control', 'public, max-age=60, stale-while-revalidate=300')
    const source = { owner: body.owner, repository: body.repo, skillPath: body.path }
    const path = await cached({
      storage: useStorage('edge-cache'),
      key: skillPageCacheKey(source),
      ttlSeconds: PAGE_URL_TTL,
      staleSeconds: PAGE_URL_STALE_TTL,
      compute: () => findSkillPagePath(platform.db, source),
      schedule: promise => runAfterResponse(event, promise),
    })
    return { path, origin: useRuntimeConfig(event).publicSiteUrl as string }
  },
  presenter: ({ path, origin }) => ({
    pageUrl: path ? new URL(path, origin).href : null,
  }),
})
