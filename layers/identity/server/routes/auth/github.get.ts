import { z } from 'zod'
import { fetchVerifiedPrimaryEmail } from '../../utils/github-emails'
import { upsertUserFromGithub } from '../../utils/users'
import { handleWatchAction } from '../../utils/watch-actions'

const githubTokensSchema = z.object({
  access_token: z.string().min(1).max(2048),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).max(2048).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
}).passthrough().superRefine((value, context) => {
  const expiryFields = [
    value.expires_in,
    value.refresh_token,
    value.refresh_token_expires_in,
  ]
  const fieldCount = expiryFields.filter(field => field !== undefined).length
  if (fieldCount !== 0 && fieldCount !== expiryFields.length) {
    context.addIssue({
      code: 'custom',
      message: 'GitHub token expiry fields must appear together',
    })
  }
})

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: false,
  },
  async onSuccess(event, { user, tokens }) {
    const profile = user as {
      id: number
      login: string
      name?: string | null
      email?: string | null
      avatar_url?: string | null
    }
    const parsedTokens = githubTokensSchema.parse(tokens)
    const accessToken = parsedTokens.access_token
    const scopes = ['read:user', 'user:email']
    const platform = event.context.platform
    if (!platform)
      throw createError({ statusCode: 500, message: 'GitHub login is unavailable' })

    // `/user` hides a private profile email. `emailRequired` stays off because
    // the module's own lookup throws past onError and accepts an unverified
    // primary. A failed lookup only costs the address, never the sign-in.
    const email = profile.email || await fetchVerifiedPrimaryEmail(accessToken).catch(() => {
      emitOperationalEvent(createWideEvent({ operation: 'oauth-primary-email', outcome: 'failed' }))
      return null
    })

    const row = await upsertUserFromGithub(event, { ...profile, email }, {
      accessToken,
      accessTokenExpiresIn: parsedTokens.expires_in ?? null,
      refreshToken: parsedTokens.refresh_token ?? null,
      refreshTokenExpiresIn: parsedTokens.refresh_token_expires_in ?? null,
      clientId: platform.env.NUXT_OAUTH_GITHUB_CLIENT_ID,
      scopes,
    })

    await setUserSession(event, {
      user: {
        id: row.id,
        githubId: row.github_id,
        login: row.login,
        name: row.name,
        avatar: row.avatar,
        onboarded: !!row.onboarded_at,
      },
      loggedInAt: Math.floor(Date.now() / 1000),
    })

    const query = getQuery(event)
    const action = typeof query.action === 'string' ? query.action : ''
    const queryReturnTo = typeof query.return_to === 'string' && query.return_to.startsWith('/') ? query.return_to : ''

    // CLI flow stashes the (longer) return_to in a cookie because OAuth round-
    // trips drop query params. Cookie takes priority over the query string.
    const cookieReturnTo = getCookie(event, 'cli_return_to')
    const returnTo = (cookieReturnTo && cookieReturnTo.startsWith('/')) ? cookieReturnTo : queryReturnTo

    if (cookieReturnTo)
      deleteCookie(event, 'cli_return_to', { path: '/' })

    if (action.startsWith('watch-') || action.startsWith('like-'))
      await handleWatchAction(event, row.id, action, returnTo)

    if (returnTo)
      return sendRedirect(event, returnTo)

    if (!row.onboarded_at)
      return sendRedirect(event, action === 'watch-collection' ? '/onboarding/email' : '/onboarding/discover')

    return sendRedirect(event, '/me')
  },
  onError(event) {
    emitOperationalEvent(createWideEvent({ operation: 'github-oauth', outcome: 'failed' }), 'error')
    return sendRedirect(event, '/login?error=oauth')
  },
})
