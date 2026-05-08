import { decryptToken } from '../../../utils/crypto'
import { requireUserRow } from '../../../utils/users'

interface GitHubStarred {
  starred_at: string
  repo: { name: string, owner: { login: string } }
}

const PER_PAGE = 100

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const config = useRuntimeConfig(event)
  const db = event.context.cloudflare.env.DB as D1Database

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)

  const enc = await db.prepare(
    `SELECT github_token_encrypted FROM users WHERE id = ?1`,
  ).bind(u.id).first<{ github_token_encrypted: string | null }>()
  if (!enc?.github_token_encrypted)
    throw createError({ statusCode: 401, message: 'Re-authentication required' })

  const token = await decryptToken(enc.github_token_encrypted, config.tokenKey as string)

  // First page wipes the cache so unstarred repos drop out.
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
  // Only cache repos with "skill" in the name. Fetching every starred repo into D1 is wasted work
  // when the registry only carries SKILL.md-bearing projects, which conventionally include "skill".
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

  // Cap at 10 pages = 1000 repos. Anyone hitting the cap can re-sync.
  // hasMore based on the unfiltered page size: GitHub returns 100 = there's more to fetch.
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
    ok: true,
    page,
    fetched: items.length,
    total: totalRow?.n ?? 0,
    matched: totalRow?.matched ?? 0,
    hasMore,
    syncedAt,
  }
})
