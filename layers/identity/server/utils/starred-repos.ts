/// <reference types="@cloudflare/workers-types" />

/**
 * A person's imported GitHub stars. The import keeps only Repositories whose
 * name mentions a Skill, and records whether the registry holds Skills for
 * each one.
 */

/** One row per Skill of a starred Repository, or one row with no Skill. */
export interface StarredRow {
  owner: string
  repo: string
  starred_at: number
  has_skill: number
  watching: number
  skill_name: string | null
  skill_display: string | null
  skill_slug: string | null
}

export async function loadStarredRows(db: D1Database, userId: number): Promise<StarredRow[]> {
  const res = await db.prepare(
    `SELECT s.owner, s.repo, s.starred_at, s.has_skill,
            CASE WHEN sub.user_id IS NULL THEN 0 ELSE 1 END as watching,
            sk.name as skill_name, sk.display_name as skill_display, sk.slug as skill_slug
     FROM user_starred_repos s
     LEFT JOIN skills sk ON sk.owner = s.owner AND sk.repo = s.repo
     LEFT JOIN skill_subscriptions sub ON sub.user_id = s.user_id AND sub.owner = s.owner AND sub.repo = s.repo
     WHERE s.user_id = ?1
     ORDER BY s.has_skill DESC, s.starred_at DESC, sk.name
     LIMIT 1000`,
  ).bind(userId).all<StarredRow>()
  return res.results ?? []
}

interface GitHubStarred {
  starred_at: string
  repo: { name: string, owner: { login: string } }
}

const PER_PAGE = 100
export const MAX_STAR_PAGES = 10

export type StarsImportPage
  = | {
    _tag: 'Imported'
    page: number
    /** Starred Repositories this page kept. */
    fetched: number
    /** Starred Repositories stored so far. */
    total: number
    /** Stored Repositories that hold Skills. */
    matched: number
    hasMore: boolean
    /** Epoch seconds, set on the last page. */
    importedAt: number | null
  }
  | { _tag: 'GithubSignInRequired' }
  | { _tag: 'GithubFailed', status: number }

/**
 * Import one page of a person's GitHub stars.
 *
 * Page 1 clears the last import first, so a run of pages replaces it. GitHub
 * failures come back as values: the dashboard and the public API answer them
 * with different statuses.
 */
export async function importStarredPage(input: {
  db: D1Database
  userId: number
  githubToken: string
  page: number
  fetch?: typeof globalThis.fetch
  now?: () => number
}): Promise<StarsImportPage> {
  const { db, userId, githubToken, page } = input
  const fetchImpl = input.fetch ?? globalThis.fetch
  const now = input.now ?? (() => Math.floor(Date.now() / 1000))

  if (page === 1)
    await db.prepare(`DELETE FROM user_starred_repos WHERE user_id = ?1`).bind(userId).run()

  const res = await fetchImpl(`https://api.github.com/user/starred?per_page=${PER_PAGE}&page=${page}`, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3.star+json',
      'User-Agent': 'skilld.dev',
    },
  })
  if (!res.ok)
    return res.status === 401 ? { _tag: 'GithubSignInRequired' } : { _tag: 'GithubFailed', status: res.status }
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
      ).bind(userId, owner, repo, starredAt)
    })
    const chunk = 50
    for (let i = 0; i < stmts.length; i += chunk)
      await db.batch(stmts.slice(i, i + chunk))
  }

  const hasMore = raw.length === PER_PAGE && page < MAX_STAR_PAGES

  let importedAt: number | null = null
  if (!hasMore) {
    importedAt = now()
    await db.prepare(`UPDATE users SET stars_synced_at = ?1 WHERE id = ?2`).bind(importedAt, userId).run()
  }

  const totalRow = await db.prepare(
    `SELECT COUNT(*) as n, SUM(has_skill) as matched FROM user_starred_repos WHERE user_id = ?1`,
  ).bind(userId).first<{ n: number, matched: number | null }>()

  return {
    _tag: 'Imported',
    page,
    fetched: items.length,
    total: totalRow?.n ?? 0,
    matched: totalRow?.matched ?? 0,
    hasMore,
    importedAt,
  }
}
