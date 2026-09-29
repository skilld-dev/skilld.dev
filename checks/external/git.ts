import { defineExternalCheck, pass } from '@harlan-zw/nuxt-checkin/external'
import { withCause } from '../_helpers/cause.mjs'
import { collectGit } from '../_helpers/collectors.mjs'

export default defineExternalCheck({
  id: 'skilld.git',
  run: withCause(async context => pass(await collectGit(context))),
})
