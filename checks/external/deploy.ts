import { defineExternalCheck, pass, unavailable } from '@harlan-zw/nuxt-checkin/external'
import { collectDeploy } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.deploy',
  async run(context) {
    const data = await collectDeploy(context)
    return data.latest?.versionId ? pass(data) : unavailable('Deployed Worker identity is unavailable.', data)
  },
})
