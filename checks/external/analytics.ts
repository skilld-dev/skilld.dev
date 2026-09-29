import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectAnalytics } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.analytics',
  run: withCause(async context => pass(await collectAnalytics(context))),
})
