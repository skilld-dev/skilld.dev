import type { WorkersOAuthClient } from 'atproto-oauth-client-cloudflare-workers'
import { getOAuthClient } from '../utils/atproto/oauth'
import { createOAuthStorage } from '../utils/atproto/storage'

export default defineNitroPlugin(async (nitroApp) => {
  const { stateStore, sessionStore } = createOAuthStorage()
  const oauthClient = getOAuthClient(stateStore, sessionStore)

  nitroApp.hooks.hook('request', (event) => {
    event.context.oauthClient = oauthClient
  })
})

declare module 'h3' {
  interface H3EventContext {
    oauthClient: WorkersOAuthClient
  }
}
