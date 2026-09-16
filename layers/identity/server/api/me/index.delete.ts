import { defineApiHandler } from '#shared/server/handler'
import {
  accountDeletionConfirmed,
  identityAccountDeleteBodySchema,
  identityAccountDeleteResponseSchema,
} from '../../../shared/contracts/account'
import { browserSession } from '../../policies/browser-session'
import { deleteAccountData, loadGithubGrant, revokeGithubGrant } from '../../utils/account-deletion'
import { requireUserRow } from '../../utils/users'

/**
 * Delete the signed-in account.
 *
 * The request must carry the sign-in cookie and the GitHub login typed by the
 * person. Local data goes first, in one transaction. The GitHub grant is
 * revoked after that, and a failed revocation still returns success, because
 * the account no longer exists.
 */
export default defineApiHandler({
  schema: identityAccountDeleteBodySchema,
  policy: [browserSession],
  response: identityAccountDeleteResponseSchema,
  handler: async ({ event, body, platform }) => {
    const account = await requireUserRow(event)
    if (!accountDeletionConfirmed(body.confirm_login, account.login)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Confirmation does not match',
        message: `Type ${account.login} to delete your account.`,
      })
    }

    const { db, env } = platform
    // The token lives on the row this request deletes, so read it first.
    const grant = await loadGithubGrant(db, account.id, env.NUXT_TOKEN_KEY)
    const deletedRows = await deleteAccountData(db, account.id, Math.floor(Date.now() / 1000))
    const revocation = await revokeGithubGrant(grant, {
      clientId: env.NUXT_OAUTH_GITHUB_CLIENT_ID,
      clientSecret: env.NUXT_OAUTH_GITHUB_CLIENT_SECRET,
    }, fetch)

    emitOperationalEvent(createWideEvent({
      'operation': 'account-deletion',
      'outcome': revocation._tag,
      'reason': revocation._tag === 'skipped' ? revocation.reason : undefined,
      'upstream.status': revocation._tag === 'failed' ? revocation.status : undefined,
      'success.count': deletedRows,
    }), revocation._tag === 'revoked' ? 'info' : 'warn')

    await clearUserSession(event)
    return { ok: true as const, github_access_revoked: revocation._tag === 'revoked' }
  },
})
