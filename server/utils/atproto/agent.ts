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

  const oauthSession = await event.context.oauthClient.restore(did).catch(() => null)
  if (!oauthSession)
    throw createError({ statusCode: 401, message: 'Your session has expired. Please sign in again.' })

  return { agent: new Agent(oauthSession), did }
}

/** Public agent for unauthenticated reads via the Bluesky AppView. */
export function getPublicAgent(): Agent {
  return new Agent('https://public.api.bsky.app')
}
