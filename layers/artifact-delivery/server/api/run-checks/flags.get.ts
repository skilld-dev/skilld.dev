import { setHeader } from 'h3'
import { readThroughCache } from '#shared/server/cache'
import { defineApiHandler } from '#shared/server/handler'
import { presentRunCheckFlags } from '../../presenters/run-check-flags'
import { runCheckFlagsQuerySchema } from '../../schemas/run-check-flags'
import { loadRunCheckFlags } from '../../utils/run-check-flags'

const RUN_CHECK_FLAGS_CACHE_KEY = 'run-checks:flags:v1'
const RUN_CHECK_FLAGS_TTL_SECONDS = 60
const RUN_CHECK_FLAGS_STALE_SECONDS = 300

/**
 * The Skills whose last two run checks failed for a reason a retry cannot
 * change. The Skill page asks for its own Skill and flags its run command.
 * The demo, trending and collection routes ask for every flag and leave
 * those Skills out.
 *
 * Public and read only: every answer is a fact the Skill page shows anyway,
 * so it has no policy. Caching the single global list in `edge-cache` serves
 * both SSR subrequests and per-skill lookups from one key instead of hitting
 * D1 once per Skill page view.
 */
export default defineApiHandler({
  schema: runCheckFlagsQuerySchema,
  handler: async ({ event, body, platform }) => {
    // The sweep settles checks every 15 minutes, so one minute of reuse is safe.
    setHeader(event, 'cache-control', 'public, max-age=60')
    setHeader(event, 'cloudflare-cdn-cache-control', 'public, max-age=60, stale-while-revalidate=300')
    const allFlags = await readThroughCache(
      useStorage('edge-cache'),
      RUN_CHECK_FLAGS_CACHE_KEY,
      () => loadRunCheckFlags(platform.db, null),
      {
        ttl: RUN_CHECK_FLAGS_TTL_SECONDS,
        staleTtl: RUN_CHECK_FLAGS_STALE_SECONDS,
        validate: Array.isArray,
      },
    )
    const [owner, repository, name] = body.skill?.split('/') ?? []
    if (!owner || !repository || !name)
      return allFlags
    const targetOwner = owner.toLowerCase()
    const targetRepository = repository.toLowerCase()
    const targetName = name.toLowerCase()
    return allFlags.filter(flag =>
      flag.owner.toLowerCase() === targetOwner
      && flag.repository.toLowerCase() === targetRepository
      && flag.name.toLowerCase() === targetName)
  },
  presenter: presentRunCheckFlags,
})
