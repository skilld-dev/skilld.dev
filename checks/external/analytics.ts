import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { collectAnalytics } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.analytics',
  async run(context) {
    return pass(await collectAnalytics(context))
  },
})
