import { sendRedirect, setCookie, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { authorizeGithubConnectionSchema } from '../../../../schemas/github-connections'
import { createGithubAppClientFromEnv } from '../../../../utils/github-app'
import {
  createGithubConnectionState,
  GITHUB_CONNECTION_RETURN_COOKIE,
  GITHUB_CONNECTION_STATE_COOKIE,
  githubConnectionReturnTo,
} from '../../../../utils/github-connection-flow'

const COOKIE_SECONDS = 10 * 60
const COOKIE_PATH = '/api/v1/github/connections'

export default defineApiHandler({
  schema: authorizeGithubConnectionSchema,
  requireAuth: true,
  async handler({ body, event, platform }) {
    const state = createGithubConnectionState()
    const cookie = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: true,
      maxAge: COOKIE_SECONDS,
      path: COOKIE_PATH,
    }
    setCookie(event, GITHUB_CONNECTION_STATE_COOKIE, state, cookie)
    setCookie(
      event,
      GITHUB_CONNECTION_RETURN_COOKIE,
      githubConnectionReturnTo(body.return_to),
      cookie,
    )
    setHeader(event, 'cache-control', 'private, no-store')
    const location = await createGithubAppClientFromEnv(platform.env)
      .createInstallationUrl(state)
    return sendRedirect(event, location)
  },
})
