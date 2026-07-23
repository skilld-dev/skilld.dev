import { recordScheduledTrigger } from '../utils/scheduled-trigger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', (payload) => {
    recordScheduledTrigger(payload)
  })
})
