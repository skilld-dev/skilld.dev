import { defineExternalCheck } from '@harlan-zw/nuxt-checkin/external'
import { collectSentry } from '../_helpers/sentry'

export default defineExternalCheck({
  id: 'sentry.skilld',
  run: collectSentry,
})
