import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectWorkers } from '../_helpers/collectors.mjs'
import { evaluateWorkers } from '../_helpers/policy.mjs'

export default defineExternalCheck({
  id: 'skilld.workers',
  run: withCause(async context => evaluateWorkers(await collectWorkers(context))),
})
