import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectCI } from '../_helpers/collectors.mjs'
import { evaluateCI } from '../_helpers/policy.mjs'

export default defineExternalCheck({
  id: 'skilld.ci',
  run: withCause(async context => evaluateCI(await collectCI(context))),
})
