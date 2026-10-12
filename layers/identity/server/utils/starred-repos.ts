/// <reference types="@cloudflare/workers-types" />

import { z } from 'zod'

/**
 * A person's imported GitHub stars. The bounded import checks every Repository name
 * against registry coverage.
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
    `WITH bounded_stars AS (
       SELECT * FROM user_starred_repos WHERE user_id = ?1
       ORDER BY starred_at DESC LIMIT 1000
     )
     SELECT COALESCE(r.owner, s.owner) AS owner, COALESCE(r.repo, s.repo) AS repo, s.starred_at,
            CASE WHEN sk.name IS NULL THEN 0 ELSE 1 END AS has_skill,
            EXISTS (SELECT 1 FROM skill_subscriptions sub WHERE sub.user_id = s.user_id
              AND sub.owner = s.owner COLLATE NOCASE AND sub.repo = s.repo COLLATE NOCASE) AS watching,
            sk.name as skill_name, sk.display_name as skill_display, sk.slug as skill_slug
     FROM bounded_stars s
     LEFT JOIN repos r ON r.owner = s.owner COLLATE NOCASE AND r.repo = s.repo COLLATE NOCASE
     LEFT JOIN skills sk ON sk.owner = r.owner AND sk.repo = r.repo
     WHERE s.user_id = ?1
     ORDER BY has_skill DESC, s.starred_at DESC, sk.name`,
  ).bind(userId).all<StarredRow>()
  return res.results ?? []
}

const githubStarredPageSchema = z.array(z.object({
  starred_at: z.iso.datetime({ offset: true }),
  repo: z.object({ name: z.string().min(1), owner: z.object({ login: z.string().min(1) }) }),
})).max(100)

const PER_PAGE = 100
export const MAX_STAR_PAGES = 10

export type StarsImportPage
  = | {
    _tag: 'Imported'
    page: number
    importId: string
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
  | { _tag: 'GithubInvalidResponse' }
  | { _tag: 'ImportRestartRequired' }

/**
 * Import one page of a person's GitHub stars.
 *
 * Pages stage separately from the last usable import. A terminal page
 * publishes the staged rows atomically. GitHub failures leave active rows intact.
 */
export async function importStarredPage(input: {
  db: D1Database
  userId: number
  githubToken: string
  page: number
  importId?: string
  fetch?: typeof globalThis.fetch
  now?: () => number
}): Promise<StarsImportPage> {
  const { db, userId, githubToken, page } = input
  const fetchImpl = input.fetch ?? globalThis.fetch
  const now = input.now ?? (() => Math.floor(Date.now() / 1000))

  const state = page === 1
    ? null
    : await db.prepare(
        'SELECT import_id, next_page FROM user_starred_import_state WHERE user_id = ?1',
      ).bind(userId).first<{ import_id: string, next_page: number }>()
  if (page !== 1 && (!state || state.next_page !== page || input.importId !== state.import_id))
    return { _tag: 'ImportRestartRequired' }
  const importId = page === 1 ? crypto.randomUUID() : state!.import_id

  const res = await fetchImpl(`https://api.github.com/user/starred?per_page=${PER_PAGE}&page=${page}`, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3.star+json',
      'User-Agent': 'skilld.dev',
    },
  })
  if (!res.ok)
    return res.status === 401 ? { _tag: 'GithubSignInRequired' } : { _tag: 'GithubFailed', status: res.status }
  const decoded = await res.json().then(
    value => ({ _tag: 'Decoded' as const, value }),
  ).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'SyntaxError')
      return { _tag: 'InvalidJson' as const }
    throw error
  })
  if (decoded._tag === 'InvalidJson')
    return { _tag: 'GithubInvalidResponse' }
  const parsed = githubStarredPageSchema.safeParse(decoded.value)
  if (!parsed.success)
    return { _tag: 'GithubInvalidResponse' }
  const raw = parsed.data
  const items = raw

  const stateGuard = 'EXISTS (SELECT 1 FROM user_starred_import_state WHERE user_id = ?1 AND import_id = ?2 AND next_page = ?3)'
  const statements: D1PreparedStatement[] = []
  if (page === 1) {
    statements.push(
      db.prepare('DELETE FROM user_starred_import WHERE user_id = ?1').bind(userId),
      db.prepare(`INSERT INTO user_starred_import_state (user_id, import_id, next_page) VALUES (?1, ?2, 1)
        ON CONFLICT (user_id) DO UPDATE SET import_id = excluded.import_id, next_page = 1`).bind(userId, importId),
    )
  }
  // One bound JSON page keeps a complete ten-page import below D1's query budget.
  const staged = items.map(item => ({
    owner: item.repo.owner.login,
    repo: item.repo.name,
    starredAt: Math.floor(new Date(item.starred_at).getTime() / 1000),
  }))
  statements.push(db.prepare(
    `INSERT OR REPLACE INTO user_starred_import (user_id, owner, repo, starred_at, has_skill)
     WITH page_stars AS (
       SELECT json_extract(value, '$.owner') AS owner, json_extract(value, '$.repo') AS repo,
         json_extract(value, '$.starredAt') AS starred_at FROM json_each(?4)
     )
     SELECT ?1, COALESCE(r.owner, star.owner), COALESCE(r.repo, star.repo), star.starred_at,
       EXISTS (SELECT 1 FROM skills sk WHERE sk.owner = star.owner COLLATE NOCASE AND sk.repo = star.repo COLLATE NOCASE)
     FROM page_stars star
     LEFT JOIN repos r ON r.owner = star.owner COLLATE NOCASE AND r.repo = star.repo COLLATE NOCASE
     WHERE ${stateGuard}`,
  ).bind(userId, importId, page, JSON.stringify(staged)))

  const link = res.headers.get('link')
  const hasNextPage = link ? /rel="next"/.test(link) : raw.length === PER_PAGE
  const hasMore = hasNextPage && page < MAX_STAR_PAGES

  // A full tenth page can have unseen stars. Publish its bounded coverage,
  // but never set the timestamp that means a complete import.
  const importedAt = !hasNextPage ? now() : null

  // Every mutation and the page advance share one D1 transaction. A stale
  // request cannot insert, publish, or clear another browser's generation.
  const countIndex = statements.length
  statements.push(db.prepare(
    'SELECT COUNT(*) AS n, SUM(has_skill) AS matched FROM user_starred_import WHERE user_id = ?1',
  ).bind(userId))
  if (!hasMore) {
    statements.push(
      db.prepare(`DELETE FROM user_starred_repos WHERE user_id = ?1 AND ${stateGuard}`).bind(userId, importId, page),
      db.prepare(`INSERT INTO user_starred_repos (user_id, owner, repo, starred_at, has_skill)
        SELECT user_id, owner, repo, starred_at, has_skill FROM user_starred_import
        WHERE user_id = ?1 AND ${stateGuard}`).bind(userId, importId, page),
      db.prepare(`UPDATE users SET stars_synced_at = ?4 WHERE id = ?1 AND ${stateGuard}`).bind(userId, importId, page, importedAt),
      db.prepare(`DELETE FROM user_starred_import WHERE user_id = ?1 AND ${stateGuard}`).bind(userId, importId, page),
    )
  }
  const advanceIndex = statements.length
  statements.push(db.prepare(
    `UPDATE user_starred_import_state SET next_page = ?4,
      active_partial = COALESCE(?5, active_partial)
      WHERE user_id = ?1 AND import_id = ?2 AND next_page = ?3`,
  ).bind(userId, importId, page, page + 1, hasMore ? null : Number(hasNextPage)))
  const results = await db.batch<{ n: number, matched: number | null }>(statements)
  if (!results[advanceIndex]?.meta.changes)
    return { _tag: 'ImportRestartRequired' }
  const totalRow = results[countIndex]?.results?.[0]

  return {
    _tag: 'Imported',
    page,
    importId,
    fetched: items.length,
    total: totalRow?.n ?? 0,
    matched: totalRow?.matched ?? 0,
    hasMore,
    importedAt,
  }
}

/**
 * A public request owns every bounded GitHub page. The frozen SDK cannot carry
 * a generation, so its pagination stays inside this request.
 */
export async function importStarredRepositories(
  input: Omit<Parameters<typeof importStarredPage>[0], 'page' | 'importId'>,
): Promise<StarsImportPage> {
  let importId: string | undefined
  for (let page = 1; page <= MAX_STAR_PAGES; page++) {
    const result = await importStarredPage({ ...input, page, importId })
    if (result._tag !== 'Imported' || !result.hasMore)
      return result
    importId = result.importId
  }
  throw new Error('Star import exceeded its bounded page limit')
}
