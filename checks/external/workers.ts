import { defineExternalCheck, pass, warn } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectWorkers } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.workers',
  run: withCause(async (context) => {
    const data = await collectWorkers(context)
    return data.nonOk.length ? warn('Worker requests have non-success outcomes.', data) : pass(data)
  }),
})
