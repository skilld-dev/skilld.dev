import { z } from 'zod'
import { ownedRepoScanWarning, scanOwnedRepos } from '../../utils/scan-owned-repos'
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

    const row = await upsertUserFromGithub(event, profile, {
      accessToken,
      accessTokenExpiresIn: parsedTokens.expires_in ?? null,
      refreshToken: parsedTokens.refresh_token ?? null,
      refreshTokenExpiresIn: parsedTokens.refresh_token_expires_in ?? null,
      clientId: platform.env.NUXT_OAUTH_GITHUB_CLIENT_ID,
      scopes,
    })

    // First-time signup: kick off a background scan of the user's public repos
    // for SKILL.md files via GitHub code search, indexing each into `skills`.
    if (!row.onboarded_at && accessToken) {
      const scanPromise = scanOwnedRepos({
        login: row.login,
        userToken: accessToken,
        db: platform.db,
        env: platform.env,
      }).then((result) => {
        const warning = ownedRepoScanWarning(result)
        if (warning)
          emitOperationalEvent(createWideEvent({ operation: 'oauth-owned-repo-scan', outcome: 'incomplete' }))
      }).catch(() => {
        emitOperationalEvent(createWideEvent({ operation: 'oauth-owned-repo-scan', outcome: 'failed' }))
      })
      const cfCtx = (event.context as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context
      if (cfCtx?.waitUntil)
        cfCtx.waitUntil(scanPromise)
      else
        void scanPromise
    }

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
