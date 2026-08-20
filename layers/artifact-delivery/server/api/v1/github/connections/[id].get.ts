import { getRouterParam, setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { githubConnectionSchema } from '../../../../schemas/github-connections'

export default defineApiHandler({
  response: githubConnectionSchema,
  requireAuth: true,
  async handler({ event, platform, user }) {
    const installationId = Number(getRouterParam(event, 'id'))
    if (!Number.isSafeInteger(installationId) || installationId <= 0)
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    const connection = await platform.db.prepare(
      `SELECT
         i.installation_id,
         i.state,
         COUNT(CASE WHEN r.state = 'selected' AND r.revoked_at IS NULL THEN 1 END) AS repository_count
       FROM github_app_installations i
       LEFT JOIN github_app_repositories r ON r.installation_id = i.installation_id
       WHERE i.installation_id = ?1 AND i.account_id = ?2
       GROUP BY i.installation_id, i.state
       LIMIT 1`,
    ).bind(installationId, user!.id).first<{
      installation_id: number
      state: 'active' | 'suspended' | 'revoked'
      repository_count: number
    }>()
    if (!connection)
      throw createError({ statusCode: 404, message: 'GitHub App installation not found' })
    setHeader(event, 'cache-control', 'private, no-store')
    return {
      installationId: connection.installation_id,
      state: connection.state,
      repositoryCount: connection.repository_count,
    }
  },
})
