import { Agent } from '@atproto/api'
import { OAuthCallbackError } from 'atproto-oauth-client-cloudflare-workers/oauth-client'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'
import { getAdminEmailForAtprotoIdentity } from '../../utils/admin'
import { scope } from '../../utils/atproto/oauth'

const OAUTH_REQUEST_COOKIE_PREFIX = 'atproto_oauth_req'
const HYPHEN_RE = /-/g

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.sessionPassword) {
    throw createError({ status: 500, message: 'Missing NUXT_SESSION_PASSWORD' })
  }

  const query = getQuery(event)
  const session = await getUserSession(event)

  if (query.handle) {
    // Initiate auth flow
    if (typeof query.handle !== 'string') {
      throw createError({ statusCode: 400, message: 'Invalid handle parameter' })
    }

    let redirectPath = '/'
    const returnTo = query.returnTo?.toString()
    if (returnTo) {
      const clientOrigin = new URL(clientUri).origin
      const returnToUrl = new URL(returnTo, clientUri)
      if (returnToUrl.origin === clientOrigin) {
        redirectPath = returnToUrl.pathname + returnToUrl.search + returnToUrl.hash
      }
    }

    const redirectUrl = await event.context.oauthClient.authorize(query.handle, {
      scope,
      state: encodeOAuthState(event, { redirectPath }),
    })

    return sendRedirect(event, redirectUrl.toString())
  }

  // Handle callback
  const params = new URLSearchParams(query as Record<string, string>)
  const result = await event.context.oauthClient.callback(params).catch((err: unknown) => {
    if (err instanceof OAuthCallbackError && err.state) {
      const state = decodeOAuthState(event, err.state)
      if (query.error === 'access_denied') {
        return sendRedirect(event, state.redirectPath) as never
      }
    }
    throw createError({ statusCode: 401, message: err instanceof Error ? err.message : 'Authentication failed' })
  })

  const state = decodeOAuthState(event, result.state)
  const profile = await getMiniProfile(result.session.did)

  await session.update({
    public: {
      did: result.session.did,
      handle: profile.handle,
      email: getAdminEmailForAtprotoIdentity({ did: result.session.did, handle: profile.handle }) ?? undefined,
      avatar: profile.avatar,
    },
  })

  return sendRedirect(event, state.redirectPath)
})

interface OAuthStateData {
  redirectPath: string
}

function encodeOAuthState(event: Parameters<typeof setCookie>[0], data: OAuthStateData): string {
  const id = crypto.randomUUID().replace(HYPHEN_RE, '')
  setCookie(event, `${OAUTH_REQUEST_COOKIE_PREFIX}_${id}`, '1', {
    maxAge: 60 * 5,
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/api/auth/atproto',
  })
  return JSON.stringify({ data, id })
}

function decodeOAuthState(event: Parameters<typeof getCookie>[0], state: string | null): OAuthStateData {
  if (!state) {
    throw createError({ statusCode: 400, message: 'Missing state parameter' })
  }

  const decoded = JSON.parse(state) as { data: OAuthStateData, id: string }
  const cookieName = `${OAUTH_REQUEST_COOKIE_PREFIX}_${decoded.id}`

  if (getCookie(event, cookieName) != null) {
    deleteCookie(event, cookieName, {
      httpOnly: true,
      secure: !import.meta.dev,
      sameSite: 'lax',
      path: '/api/auth/atproto',
    })
  }
  else {
    throw createError({ statusCode: 400, message: 'Missing authentication state. Please enable cookies and try again.' })
  }

  return decoded.data
}

async function getMiniProfile(did: string) {
  const agent = new Agent('https://public.api.bsky.app')

  try {
    const res = await agent.getProfile({ actor: did })
    return {
      handle: res.data.handle ?? did,
      avatar: res.data.avatar,
    }
  }
  catch (err) {
    console.warn('[auth] Failed to fetch profile for', did, err)
    return { handle: did, avatar: undefined }
  }
}
