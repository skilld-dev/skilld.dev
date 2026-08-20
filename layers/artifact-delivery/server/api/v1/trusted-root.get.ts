import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { trustedRootSchema } from '../../schemas/contracts'
import { withArtifactProblems } from '../../utils/artifact-problem'
import { parseTrustedRoot } from '../../utils/trusted-root'

export default withArtifactProblems(defineApiHandler({
  response: trustedRootSchema,
  handler({ event, platform }) {
    const root = parseTrustedRoot(
      platform.env.ARTIFACT_TRUSTED_ROOT_JSON,
      Math.floor(Date.now() / 1000),
    )
    setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=300')
    return root
  },
}))
