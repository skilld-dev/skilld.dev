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
    `SELECT COALESCE(r.owner, s.owner) AS owner, COALESCE(r.repo, s.repo) AS repo,
            s.source, s.muted_until, s.created_at
     FROM (
       SELECT *, ROW_NUMBER() OVER (
         PARTITION BY owner COLLATE NOCASE, repo COLLATE NOCASE
         ORDER BY source = 'like', created_at, source, owner, repo
       ) AS watch_rank FROM skill_subscriptions WHERE user_id = ?1
     ) s
     LEFT JOIN repos r ON r.owner = s.owner COLLATE NOCASE AND r.repo = s.repo COLLATE NOCASE
     WHERE s.watch_rank = 1
     ORDER BY created_at DESC`,
  ).bind(userId).all<WatchRow>()
  return res.results ?? []
}

/** True when the registry holds the Repository, so the digest can report on it. */
export async function repositoryExists(db: D1Database, ref: RepositoryRef): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS found FROM repos WHERE owner = ?1 COLLATE NOCASE AND repo = ?2 COLLATE NOCASE`,
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
  await createRepositoryWatches(db, userId, [ref], 'manual')
}

/** Resolve GitHub spelling once, then persist the registry's frozen identity. */
export async function createRepositoryWatches(
  db: D1Database,
  userId: number,
  refs: readonly RepositoryRef[],
  source: string,
): Promise<number> {
  if (!refs.length)
    return 0
  const matches = await db.batch<RepositoryRef>(refs.map(ref => db.prepare(
    `SELECT owner, repo FROM repos WHERE owner = ?1 COLLATE NOCASE AND repo = ?2 COLLATE NOCASE`,
  ).bind(ref.owner, ref.repo)))
  const canonicalRefs = matches.map((match) => {
    const canonical = match.results?.[0]
    if (!canonical)
      throw createError({ statusCode: 404, message: 'Repository not found' })
    return canonical
  })
  const now = Math.floor(Date.now() / 1000)
  const result = await db.batch(canonicalRefs.flatMap(canonical => [
    db.prepare(
      `INSERT INTO skill_subscriptions (user_id, owner, repo, source, muted_until, created_at)
         SELECT ?1, ?2, ?3,
           COALESCE((SELECT source FROM skill_subscriptions WHERE user_id = ?1
             AND owner = ?2 COLLATE NOCASE AND repo = ?3 COLLATE NOCASE AND source != 'like'
             ORDER BY created_at, source LIMIT 1), ?4),
           (SELECT muted_until FROM skill_subscriptions WHERE user_id = ?1
             AND owner = ?2 COLLATE NOCASE AND repo = ?3 COLLATE NOCASE
             ORDER BY source = 'like', created_at, source, owner, repo LIMIT 1),
           COALESCE((SELECT MIN(created_at) FROM skill_subscriptions WHERE user_id = ?1
             AND owner = ?2 COLLATE NOCASE AND repo = ?3 COLLATE NOCASE), ?5)
         ON CONFLICT(user_id, owner, repo) DO UPDATE SET
           source = excluded.source, muted_until = excluded.muted_until, created_at = excluded.created_at`,
    ).bind(userId, canonical.owner, canonical.repo, source, now),
    db.prepare(
      `DELETE FROM skill_subscriptions WHERE user_id = ?1
         AND owner = ?2 COLLATE NOCASE AND repo = ?3 COLLATE NOCASE
         AND (owner != ?2 OR repo != ?3)`,
    ).bind(userId, canonical.owner, canonical.repo),
  ]))
  return result.reduce((inserted, row, index) => inserted + (index % 2 === 0 ? row.meta?.changes ?? 0 : 0), 0)
}

/** Remove a watch, whatever its source. Likes stay. */
export async function unwatchRepository(db: D1Database, userId: number, ref: RepositoryRef): Promise<void> {
  await db.prepare(
    `DELETE FROM skill_subscriptions WHERE user_id = ?1 AND owner = ?2 COLLATE NOCASE AND repo = ?3 COLLATE NOCASE`,
  ).bind(userId, ref.owner, ref.repo).run()
}
