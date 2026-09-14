import { defineExternalCheck, pass, warn } from '@harlan-zw/nuxt-checkin/external'
import { collectWorkers } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.workers',
  async run(context) {
    const data = await collectWorkers(context)
    return data.nonOk.length ? warn('Worker requests have non-success outcomes.', data) : pass(data)
  },
})
