import type { H3Event } from 'h3'
import { useSession } from 'h3'
import { z } from 'zod'
import { parseReturnTo } from '#shared/return-to'
import { fetchVerifiedPrimaryEmail } from '../../utils/github-emails'
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

const githubHandler = defineOAuthGitHubEventHandler({
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

    // First sign-in: scan the account's public repositories for SKILL.md and
    // index what it finds. This is how the registry grows, and the files are
    // already public on GitHub. `repo_indexing` is on by default, and /me
    // turns it off; an account that turned it off is never scanned again.
    if (!row.onboarded_at && accessToken && row.repo_indexing) {
      const scanPromise = scanOwnedRepos({
        login: row.login,
        userToken: accessToken,
        db: platform.db,
        env: platform.env,
      }).then((result) => {
        if (ownedRepoScanWarning(result))
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

    const intent = await loginIntentSession(event)
    const action = typeof intent.data.action === 'string' ? intent.data.action : ''
    const returnTo = parseReturnTo(intent.data.returnTo, '')

    if (action.startsWith('watch-') || action.startsWith('like-'))
      await handleWatchAction(event, row.id, action, returnTo)

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

    await intent.clear()

    if (returnTo)
      return sendRedirect(event, returnTo)

    if (!row.onboarded_at)
      return sendRedirect(event, action === 'watch-collection' ? '/onboarding/email' : '/onboarding/discover')

    return sendRedirect(event, '/me')
  },
  onError: loginFailed,
})

async function loginFailed(event: H3Event) {
  emitOperationalEvent(createWideEvent({ operation: 'github-oauth', outcome: 'failed' }), 'error')
  const intent = await loginIntentSession(event)
  const params = new URLSearchParams({ error: 'oauth' })
  const returnTo = parseReturnTo(intent.data.returnTo, '')
  if (returnTo)
    params.set('return_to', returnTo)
  if (typeof intent.data.action === 'string' && intent.data.action)
    params.set('action', intent.data.action)
  await intent.clear()
  return sendRedirect(event, `/login?${params}`)
}

// Seal browser intent separately from identity. GitHub returns only code and state.
function loginIntentSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  return useSession<{ returnTo: string, action: string }>(event, {
    name: 'skilld-login-intent',
    password: process.env.NUXT_SESSION_PASSWORD || config.session.password,
    maxAge: 600,
    cookie: { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, path: '/' },
  })
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (!query.code && !query.error && !query.state) {
    const intent = await loginIntentSession(event)
    const action = ['like-skill', 'watch-skill', 'watch-collection'].includes(String(query.action))
      ? String(query.action)
      : ''
    await intent.update({ returnTo: parseReturnTo(query.return_to, ''), action })
  }
  // Provider network failures can throw before the OAuth error callback runs.
  return githubHandler(event).catch(() => loginFailed(event))
})
