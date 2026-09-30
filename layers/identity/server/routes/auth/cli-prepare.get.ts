/**
 * Pre-OAuth bounce that preserves `return_to` across the GitHub redirect.
 *
 * nuxt-auth-utils' `defineOAuthGitHubEventHandler` drops query params on the
 * way to GitHub, so the CLI's loopback target (`/cli/authorize?challenge=…`)
 * is lost by the time `onSuccess` fires. Stash it in a 10-minute cookie and
 * `auth/github.get.ts:onSuccess` reads it back.
 */
import { parseReturnTo } from '#shared/return-to'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const returnTo = parseReturnTo(query.return_to)

  setCookie(event, 'cli_return_to', returnTo, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 600,
    path: '/',
  })

  return sendRedirect(event, '/auth/github')
})
