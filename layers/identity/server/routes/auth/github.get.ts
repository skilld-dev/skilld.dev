import { upsertUserFromGithub } from '../../utils/users'
import { handleWatchAction } from '../../utils/watch-actions'

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
    const accessToken = (tokens as { access_token?: string }).access_token ?? ''
    const scopes = ['read:user', 'user:email']

    const row = await upsertUserFromGithub(event, profile, accessToken, scopes)

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

    if (action.startsWith('watch-'))
      await handleWatchAction(event, row.id, action, returnTo)

    if (returnTo)
      return sendRedirect(event, returnTo)

    if (!row.onboarded_at)
      return sendRedirect(event, action === 'watch-collection' ? '/onboarding/cadence' : '/onboarding/discover')

    return sendRedirect(event, '/me')
  },
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return sendRedirect(event, '/login?error=oauth')
  },
})
