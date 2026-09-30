import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectDeploy } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.deploy',
  run: withCause(async (context) => {
    const data = await collectDeploy(context)
    return data.latest?.versionId ? pass(data) : { _tag: 'Warn' as const, reason: 'Deployed Worker identity is unavailable.', evidence: data, coverage: 'incomplete' as const }
  }),
})
