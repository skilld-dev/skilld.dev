import { defineApiHandler } from '#shared/server/handler'
import { authenticated } from '../../../policies/authenticated'
import { StarsSyncQuery } from '../../../schemas/stars'
import { decryptToken } from '../../../utils/crypto'
import { requireUserRow } from '../../../utils/users'

interface GitHubStarred {
  starred_at: string
  repo: { name: string, owner: { login: string } }
}

const PER_PAGE = 100

export default defineApiHandler({
  schema: StarsSyncQuery,
  policy: [authenticated],
  handler: async ({ event, body, platform }) => {
    const u = await requireUserRow(event)
    const config = useRuntimeConfig(event)
    const { db } = platform
    const { page } = body

    const enc = await db.prepare(
      `SELECT github_token_encrypted FROM users WHERE id = ?1`,
    ).bind(u.id).first<{ github_token_encrypted: string | null }>()
    if (!enc?.github_token_encrypted)
      throw createError({ statusCode: 401, message: 'Re-authentication required' })

    const token = await decryptToken(enc.github_token_encrypted, config.tokenKey as string)

    if (page === 1)
      await db.prepare(`DELETE FROM user_starred_repos WHERE user_id = ?1`).bind(u.id).run()

    const res = await fetch(`https://api.github.com/user/starred?per_page=${PER_PAGE}&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3.star+json',
        'User-Agent': 'skilld.dev',
      },
    })
    if (!res.ok) {
      if (res.status === 401)
        throw createError({ statusCode: 401, message: 'Re-authentication required' })
      throw createError({ statusCode: 502, message: `GitHub error ${res.status}` })
    }
    const raw = await res.json() as GitHubStarred[]
    const items = raw.filter(it => /skill/i.test(it.repo.name))

    if (items.length) {
      const stmts = items.map((it) => {
        const owner = it.repo.owner.login
        const repo = it.repo.name
        const starredAt = Math.floor(new Date(it.starred_at).getTime() / 1000)
        return db.prepare(
          `INSERT OR REPLACE INTO user_starred_repos (user_id, owner, repo, starred_at, has_skill)
           VALUES (?1, ?2, ?3, ?4,
             (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END
              FROM skills WHERE owner = ?2 AND repo = ?3))`,
        ).bind(u.id, owner, repo, starredAt)
      })
      const chunk = 50
      for (let i = 0; i < stmts.length; i += chunk)
        await db.batch(stmts.slice(i, i + chunk))
    }

    const hasMore = raw.length === PER_PAGE && page < 10

    let syncedAt: number | null = null
    if (!hasMore) {
      syncedAt = Math.floor(Date.now() / 1000)
      await db.prepare(`UPDATE users SET stars_synced_at = ?1 WHERE id = ?2`).bind(syncedAt, u.id).run()
    }

    const totalRow = await db.prepare(
      `SELECT COUNT(*) as n, SUM(has_skill) as matched FROM user_starred_repos WHERE user_id = ?1`,
    ).bind(u.id).first<{ n: number, matched: number | null }>()

    return {
      ok: true as const,
      page,
      fetched: items.length,
      total: totalRow?.n ?? 0,
      matched: totalRow?.matched ?? 0,
      hasMore,
      syncedAt,
    }
  },
})
