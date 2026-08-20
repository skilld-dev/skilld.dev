import { getHeader, getRouterParam, setHeader } from 'h3'
import { resolveBearerSession } from '#layers/identity/server/utils/bearer'
import { defineApiHandler } from '#shared/server/handler'
import { artifactIdSchema } from '../../../../schemas/contracts'
import { withArtifactProblems } from '../../../../utils/artifact-problem'
import { createD1PrivateArtifactKeyProvider, privateArtifactWrappingKeysFromEnv } from '../../../../utils/private-crypto'
import { privateArtifactAccessEnabled } from '../../../../utils/private-feature'
import { redeemPrivateArtifactGrant } from '../../../../utils/private-grant'

export default withArtifactProblems(defineApiHandler({
  async handler({ event, platform }) {
    setHeader(event, 'cache-control', 'no-store')
    if (!privateArtifactAccessEnabled(platform.env))
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    const artifactId = artifactIdSchema.safeParse(getRouterParam(event, 'id'))
    const authorization = getHeader(event, 'authorization')
    const grant = getHeader(event, 'x-skilld-grant')
    const bearerUser = authorization?.startsWith('Bearer ')
      ? await resolveBearerSession(event)
      : null
    if (
      !artifactId.success
      || !authorization?.startsWith('Bearer ')
      || !bearerUser
      || !grant
    ) {
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    }
    const result = await redeemPrivateArtifactGrant({
      db: platform.db,
      bucket: platform.env.PRIVATE_ARTIFACTS,
      keys: createD1PrivateArtifactKeyProvider(
        platform.db,
        privateArtifactWrappingKeysFromEnv(platform.env),
      ),
      now: Math.floor(Date.now() / 1000),
    }, bearerUser.id, artifactId.data, grant)
    if (result._tag === 'not-found')
      throw createError({ statusCode: 404, message: 'Artifact not found' })
    if (result._tag === 'rejected') {
      throw createError({
        statusCode: 409,
        message: 'Artifact delivery is not available',
        data: { code: result.code },
      })
    }
    return new Response(Uint8Array.from(result.bytes).buffer, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="${artifactId.data.slice('sha256:'.length)}.tar"`,
        'content-length': String(result.bytes.byteLength),
        'content-type': 'application/x-tar',
      },
    })
  },
}))
