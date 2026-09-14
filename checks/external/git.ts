import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { collectGit } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.git',
  async run(context) {
    return pass(await collectGit(context))
  },
})
