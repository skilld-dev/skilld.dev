import type { H3Event } from 'h3'
import { Agent } from '@atproto/api'

/**
 * Get an authenticated AT Protocol agent for the current session user.
 * Restores the OAuth session from storage and returns an Agent bound to their PDS.
 */
export async function getAuthenticatedAgent(event: H3Event): Promise<{ agent: Agent, did: string }> {
  const session = await getUserSession(event)
  const did = session.data?.public?.did as string | undefined
  if (!did)
    throw createError({ statusCode: 401, message: 'Sign in to continue.' })

  let oauthSession
  try {
    oauthSession = await event.context.oauthClient.restore(did)
  }
  catch (err) {
    console.warn('[auth] Failed to restore OAuth session for', did, err)
    throw createError({ statusCode: 401, message: 'Your session has expired. Please sign in again.' })
  }
  if (!oauthSession)
    throw createError({ statusCode: 401, message: 'Your session has expired. Please sign in again.' })

  return { agent: new Agent(oauthSession), did }
}

/**
 * Public agent for unauthenticated reads via the Bluesky AppView.
 * Uses api.bsky.app rather than public.api.bsky.app: the latter sits behind
 * Cloudflare with stricter anti-bot rules that 403 some networks/IPs.
 */
export function getPublicAgent(): Agent {
  return new Agent('https://api.bsky.app')
}

/**
 * Resolve a DID to its PDS endpoint and return an Agent pointed at that PDS.
 * Required for repo operations (listRecords, getRecord) which aren't available
 * on the Bluesky public AppView.
 */
export async function getPdsAgent(did: string): Promise<Agent> {
  const cacheKey = `pds-url:${did}`
  const cached = await useStorage('cache').getItem<string>(cacheKey)
  if (cached)
    return new Agent(cached)

  const res = await $fetch<{ service?: { id: string, serviceEndpoint: string }[] }>(
    did.startsWith('did:plc:')
      ? `https://plc.directory/${did}`
      : `https://${did.replace('did:web:', '')}/.well-known/did.json`,
    { responseType: 'json' },
  )

  const pds = res.service?.find(s => s.id === '#atproto_pds')
  if (!pds?.serviceEndpoint)
    throw createError({ statusCode: 502, message: `Could not resolve PDS for ${did}` })

  await useStorage('cache').setItem(cacheKey, pds.serviceEndpoint, { ttl: 60 * 60 })
  return new Agent(pds.serviceEndpoint)
}
