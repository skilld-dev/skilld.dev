import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectD1 } from '../_helpers/collectors.mjs'
import { evaluateD1 } from '../_helpers/policy.mjs'

export default defineExternalCheck({
  id: 'skilld.database',
  run: withCause(async context => evaluateD1(await collectD1(context), context.now, context.since)),
})
