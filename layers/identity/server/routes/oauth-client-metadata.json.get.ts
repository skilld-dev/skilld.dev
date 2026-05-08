import { getOauthClientMetadata } from '../utils/atproto/oauth'

export default defineEventHandler(() => {
  return getOauthClientMetadata()
})
