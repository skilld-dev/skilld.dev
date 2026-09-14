import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { collectCI } from '../_helpers/collectors.mjs'
import { evaluateCI } from '../_helpers/policy.mjs'

export default defineExternalCheck({
  id: 'skilld.ci',
  async run(context) {
    return evaluateCI(await collectCI(context))
  },
})
