import { decryptToken } from '../../../utils/crypto'
import { requireUserRow } from '../../../utils/users'

interface GitHubStarred {
  starred_at: string
  repo: { name: string, owner: { login: string } }
}

export default defineEventHandler(async (event) => {
  const u = await requireUserRow(event)
  const config = useRuntimeConfig(event)
  const db = event.context.cloudflare.env.DB as D1Database

  const enc = await db.prepare(
    `SELECT github_token_encrypted FROM users WHERE id = ?1`,
  ).bind(u.id).first<{ github_token_encrypted: string | null }>()
  if (!enc?.github_token_encrypted)
    throw createError({ statusCode: 401, message: 'Re-authentication required' })

  const token = await decryptToken(enc.github_token_encrypted, config.tokenKey as string)

  const collected: Array<{ owner: string, repo: string, starredAt: number }> = []
  // Cap at 10 pages = 1000 repos. Anyone hitting the cap can re-sync.
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/user/starred?per_page=100&page=${page}`, {
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
    const items = await res.json() as GitHubStarred[]
    for (const it of items) {
      collected.push({
        owner: it.repo.owner.login,
        repo: it.repo.name,
        starredAt: Math.floor(new Date(it.starred_at).getTime() / 1000),
      })
    }
    if (items.length < 100)
      break
  }

  const now = Math.floor(Date.now() / 1000)
  // Replace the cache wholesale so unstarred repos drop out.
  await db.prepare(`DELETE FROM user_starred_repos WHERE user_id = ?1`).bind(u.id).run()
  if (collected.length) {
    const stmts = collected.map(r => db.prepare(
      `INSERT INTO user_starred_repos (user_id, owner, repo, starred_at, has_skill)
       VALUES (?1, ?2, ?3, ?4,
         (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END
          FROM skills WHERE owner = ?2 AND repo = ?3))`,
    ).bind(u.id, r.owner, r.repo, r.starredAt))
    // D1 batch limit is generous but break into chunks to be safe.
    const chunk = 50
    for (let i = 0; i < stmts.length; i += chunk)
      await db.batch(stmts.slice(i, i + chunk))
  }
  await db.prepare(`UPDATE users SET stars_synced_at = ?1 WHERE id = ?2`).bind(now, u.id).run()

  return { ok: true, count: collected.length, syncedAt: now }
})
