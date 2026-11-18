import { getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { trustedRootSchema } from '../../../schemas/contracts'
import { withArtifactProblems } from '../../../utils/artifact-problem'
import { parseTrustedRoots } from '../../../utils/trusted-root'

// skilld CLI 3.7.0 and later fetch the root they pin by its id, so a new root
// never replaces the one an older CLI pins.
export default withArtifactProblems(defineApiHandler({
  response: trustedRootSchema,
  handler({ event, platform }) {
    const rootKeyId = getRouterParam(event, 'rootKeyId')
    const root = parseTrustedRoots(platform.env.ARTIFACT_TRUSTED_ROOTS_JSON, Math.floor(Date.now() / 1000))
      .find(served => served.rootKeyId === rootKeyId)
    if (!root)
      throw createError({ statusCode: 404, message: 'Trusted root not found' })
    setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=300')
    return root
  },
}))
