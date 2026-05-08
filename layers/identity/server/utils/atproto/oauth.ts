import type { WorkersSavedSessionStore, WorkersSavedStateStore } from 'atproto-oauth-client-cloudflare-workers'
import type { OAuthClientMetadata } from 'atproto-oauth-client-cloudflare-workers/oauth-client'
import { WorkersOAuthClient } from 'atproto-oauth-client-cloudflare-workers'
import { requestLocalLock } from 'atproto-oauth-client-cloudflare-workers/oauth-client'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'

export const scope = 'atproto transition:generic'

export function getOauthClientMetadata(): OAuthClientMetadata {
  const redirect_uri = `${clientUri}/api/auth/atproto` as `https://${string}`

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

export function getOAuthClient(stateStore: WorkersSavedStateStore, sessionStore: WorkersSavedSessionStore): WorkersOAuthClient {
  const clientMetadata = getOauthClientMetadata()

  return new WorkersOAuthClient({
    stateStore,
    sessionStore,
    clientMetadata,
    requestLock: requestLocalLock,
  })
}
