import type { OAuthClientMetadata, OAuthRedirectUri } from '@atproto/oauth-client-node'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'
import { AtprotoDohHandleResolver, NodeOAuthClient, oauthRedirectUriSchema } from '@atproto/oauth-client-node'
import { useOAuthStorage } from './storage'

export const scope = 'atproto'

export const handleResolver = new AtprotoDohHandleResolver({
  dohEndpoint: 'https://cloudflare-dns.com/dns-query',
})

export function getOauthClientMetadata(): OAuthClientMetadata {
  const redirect_uri: OAuthRedirectUri = oauthRedirectUriSchema.parse(
    `${clientUri}/api/auth/atproto`,
  )

  // In dev, use loopback client_id (public client, no JWKs needed)
  const client_id
    = import.meta.dev
      ? `http://localhost?redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope)}`
      : `${clientUri}/oauth-client-metadata.json`

  return {
    client_name: 'skilld.dev',
    client_id,
    client_uri: clientUri,
    scope,
    redirect_uris: [redirect_uri],
    grant_types: ['authorization_code', 'refresh_token'],
    application_type: 'web',
    dpop_bound_access_tokens: true,
    response_types: ['code'],
    subject_type: 'public',
    authorization_signed_response_alg: 'RS256',
    token_endpoint_auth_method: 'none',
  }
}

export async function getNodeOAuthClient(): Promise<NodeOAuthClient> {
  const { stateStore, sessionStore } = useOAuthStorage()
  const clientMetadata = getOauthClientMetadata()

  return new NodeOAuthClient({
    stateStore,
    sessionStore,
    clientMetadata,
    handleResolver,
  })
}
