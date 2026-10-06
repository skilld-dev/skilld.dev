import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentRunCheckFlags } from '../../presenters/run-check-flags'
import { runCheckFlagsQuerySchema } from '../../schemas/run-check-flags'
import { loadRunCheckFlags } from '../../utils/run-check-flags'

/**
 * The Skills whose last two run checks failed for a reason a retry cannot
 * change. The Skill page asks for its own Skill and flags its run command.
 * The demo, trending and collection routes ask for every flag and leave
 * those Skills out.
 *
 * Public and read only: every answer is a fact the Skill page shows anyway,
 * so it has no policy. It reads only flagged rows, through the streak index.
 */
export default defineApiHandler({
  schema: runCheckFlagsQuerySchema,
  handler: async ({ event, body, platform }) => {
    // The sweep settles checks every 15 minutes, so one minute of reuse is safe.
    setHeader(event, 'cache-control', 'public, max-age=60')
    const [owner, repository, name] = body.skill?.split('/') ?? []
    const skill = owner && repository && name ? { owner, repository, name } : null
    return await loadRunCheckFlags(platform.db, skill)
  },
  presenter: presentRunCheckFlags,
})
