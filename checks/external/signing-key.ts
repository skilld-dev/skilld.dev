import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { evaluateSigningKeys, fetchRootKeys, readSignerKeys } from '../_helpers/signing-key'

/**
 * Warns 30 days before Artifact signing stops. The signer windows come from
 * `workers/artifact-signer/wrangler.jsonc` on this checkout, which the deploy
 * workflow ships. The trusted root comes from production.
 */
export default defineExternalCheck({
  id: 'skilld.signing-key',
  run: withCause(async context => evaluateSigningKeys({
    signer: await readSignerKeys(context.rootDir),
    root: await fetchRootKeys(context.signal),
    now: Math.floor(context.now.getTime() / 1000),
  })),
})
