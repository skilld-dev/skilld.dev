import { getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentArtifactResolution } from '../../../presenters/resolution'
import { resolutionIdSchema, resolutionSchema } from '../../../schemas/contracts'
import { withArtifactProblems } from '../../../utils/artifact-problem'
import { canReadPrivateResolution } from '../../../utils/private-access'
import { getResolution } from '../../../utils/state'

export default withArtifactProblems(defineApiHandler({
  response: resolutionSchema,
  async handler({ event, platform, user }) {
    const resolutionId = resolutionIdSchema.safeParse(getRouterParam(event, 'id'))
    if (!resolutionId.success)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    const row = await getResolution(platform.db, resolutionId.data)
    if (!row)
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    if (
      row.visibility === 'private'
      && (!user?.id || !await canReadPrivateResolution(platform.db, user.id, row.id))
    ) {
      throw createError({ statusCode: 404, message: 'Resolution not found' })
    }
    setHeader(event, 'cache-control', 'private, no-store')
    return row
  },
  presenter: presentArtifactResolution,
}))
