import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { ReposScanBody } from '../../../schemas/repos'
import { decryptToken } from '../../../utils/crypto'
import { scanOwnedRepos } from '../../../utils/scan-owned-repos'
import { requireUserRow } from '../../../utils/users'

export default defineApiHandler({
  schema: ReposScanBody,
  policy: [authenticated],
  handler: async ({ event, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const { db, env } = platform

    const enc = await db.prepare(
      `SELECT github_token_encrypted FROM users WHERE id = ?1`,
    ).bind(u.id).first<{ github_token_encrypted: string | null }>()
    if (!enc?.github_token_encrypted)
      throw createError({ statusCode: 401, message: 'Re-authentication required' })

    const userToken = await decryptToken(enc.github_token_encrypted, config.tokenKey as string)

    const result = await scanOwnedRepos({
      login: u.login,
      userToken,
      db,
      env: env as unknown as Record<string, unknown>,
    })

    return { ok: true as const, ...result }
  },
})
