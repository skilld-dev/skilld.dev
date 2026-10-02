/// <reference types="@cloudflare/workers-types" />

/**
 * Watches: repo-grained rows in `skill_subscriptions` that decide what the
 * digest reports. `source` records why the row exists: 'manual', 'like',
 * 'star-import', 'collection:<slug>', or 'cli' from the v2 CLI.
 */

export interface RepositoryRef {
  owner: string
  repo: string
}

export interface WatchRow {
  owner: string
  repo: string
  source: string
  muted_until: number | null
  created_at: number
}

/** Every watch of one person, newest first. */
export async function loadWatches(db: D1Database, userId: number): Promise<WatchRow[]> {
  const res = await db.prepare(
    `SELECT owner, repo, source, muted_until, created_at
     FROM skill_subscriptions
     WHERE user_id = ?1
     ORDER BY created_at DESC`,
  ).bind(userId).all<WatchRow>()
  return res.results ?? []
}

/** True when the registry holds the Repository, so the digest can report on it. */
export async function repositoryExists(db: D1Database, ref: RepositoryRef): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS found FROM repos WHERE owner = ?1 AND repo = ?2`,
  ).bind(ref.owner, ref.repo).first<{ found: number }>()
  return row !== null
}

/**
 * Watch one Repository on purpose.
 *
 * A row a like added becomes 'manual': `unlikeSkill` sweeps only 'like' rows,
 * so a deliberate watch must not stay one. Every other source was already a
 * deliberate choice and keeps its reason.
 */
export async function watchRepository(db: D1Database, userId: number, ref: RepositoryRef): Promise<void> {
  await db.prepare(
    `INSERT INTO skill_subscriptions (user_id, owner, repo, source, created_at)
     VALUES (?1, ?2, ?3, 'manual', ?4)
     ON CONFLICT (user_id, owner, repo) DO UPDATE SET source = 'manual'
     WHERE skill_subscriptions.source = 'like'`,
  ).bind(userId, ref.owner, ref.repo, Math.floor(Date.now() / 1000)).run()
}

/** Remove a watch, whatever its source. Likes stay. */
export async function unwatchRepository(db: D1Database, userId: number, ref: RepositoryRef): Promise<void> {
  await db.prepare(
    `DELETE FROM skill_subscriptions WHERE user_id = ?1 AND owner = ?2 AND repo = ?3`,
  ).bind(userId, ref.owner, ref.repo).run()
}
