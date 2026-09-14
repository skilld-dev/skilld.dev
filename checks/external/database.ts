import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { collectD1 } from '../_helpers/collectors.mjs'
import { evaluateD1 } from '../_helpers/policy.mjs'

export default defineExternalCheck({
  id: 'skilld.database',
  async run(context) {
    return evaluateD1(await collectD1(context), context.now, context.since)
  },
})
