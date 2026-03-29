import type { NodeOAuthClient } from '@atproto/oauth-client-node'
import { getNodeOAuthClient } from '../utils/atproto/oauth'

export default defineNitroPlugin(async (nitroApp) => {
  const oauthClient = await getNodeOAuthClient()

  nitroApp.hooks.hook('request', (event) => {
    event.context.oauthClient = oauthClient
  })
})

declare module 'h3' {
  interface H3EventContext {
    oauthClient: NodeOAuthClient
  }
}
