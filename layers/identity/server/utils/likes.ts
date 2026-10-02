/// <reference types="@cloudflare/workers-types" />
import { enqueueSkillDirtyStatement } from '~~/server/utils/skill-dirty'

/**
 * Liking a skill is the single per-skill primitive (ADR-0003). It replaced the
 * "Save to collection" popover and the "Watch for changes" button.
 *
 * Likes are skill-grained; the digest subscription they imply is repo-grained,
 * so the two are kept in sync here rather than by the caller. Every write goes
 * through a single db.batch(), which D1 runs sequentially inside an implicit
 * transaction — that ordering is what lets the subscription cleanup read the
 * result of the like delete without a separate round trip.
 */

export interface SkillLikeRef {
  owner: string
  repo: string
  name: string
}

/**
 * Likes are public and can order /skills (ADR-0003), which makes them worth
 * farming. GitHub OAuth is the real barrier; this is the backstop, and it is
 * the first rate limit on a user-facing write in this codebase. Served by
 * idx_skill_likes_user.
 */
export const MAX_LIKES_PER_DAY = 200

const DAY_SECONDS = 86400

export async function likeSkill(
  db: D1Database,
  userId: number,
  ref: SkillLikeRef,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000)

  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM skill_likes WHERE user_id = ?1 AND created_at > ?2`)
    .bind(userId, now - DAY_SECONDS)
    .first<{ n: number }>()

  if ((recent?.n ?? 0) >= MAX_LIKES_PER_DAY) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Like limit reached (${MAX_LIKES_PER_DAY} per day)`,
    })
  }

  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO skill_likes (user_id, owner, repo, name, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    ).bind(userId, ref.owner, ref.repo, ref.name, now),
    // OR IGNORE is what protects an existing 'manual' or 'star-import' row from
    // being downgraded to 'like' and then swept away by a later unlike.
    db.prepare(
      `INSERT OR IGNORE INTO skill_subscriptions (user_id, owner, repo, source, created_at)
       VALUES (?1, ?2, ?3, 'like', ?4)`,
    ).bind(userId, ref.owner, ref.repo, now),
    enqueueSkillDirtyStatement(db, { ...ref, reason: 'like' }),
  ])

  return readLiveLikeCount(db, ref)
}

export async function unlikeSkill(
  db: D1Database,
  userId: number,
  ref: SkillLikeRef,
): Promise<number> {
  await db.batch([
    db.prepare(
      `DELETE FROM skill_likes
       WHERE user_id = ?1 AND owner = ?2 AND repo = ?3 AND name = ?4`,
    ).bind(userId, ref.owner, ref.repo, ref.name),
    // Runs after the delete above, so NOT EXISTS sees the post-delete state.
    // The source guard means a repo the user watches deliberately survives.
    db.prepare(
      `DELETE FROM skill_subscriptions
       WHERE user_id = ?1 AND owner = ?2 AND repo = ?3 AND source = 'like'
         AND NOT EXISTS (
           SELECT 1 FROM skill_likes
           WHERE user_id = ?1 AND owner = ?2 AND repo = ?3
         )`,
    ).bind(userId, ref.owner, ref.repo),
    enqueueSkillDirtyStatement(db, { ...ref, reason: 'like' }),
  ])

  return readLiveLikeCount(db, ref)
}

function readLiveLikeCount(db: D1Database, ref: SkillLikeRef): Promise<number> {
  return db.prepare(`SELECT COUNT(*) AS count
     FROM skill_likes
     WHERE owner = ?1 AND repo = ?2 AND name = ?3`).bind(ref.owner, ref.repo, ref.name).first<{ count: number }>().then(row => row?.count ?? 0)
}

/** True when the registry holds the Skill. A like on anything else is refused. */
export async function skillExists(db: D1Database, ref: SkillLikeRef): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS found FROM skills WHERE owner = ?1 AND repo = ?2 AND name = ?3`,
  ).bind(ref.owner, ref.repo, ref.name).first<{ found: number }>()
  return row !== null
}

export interface LikedSkillRef extends SkillLikeRef {
  /** Epoch seconds. */
  likedAt: number
}

/** One page of a person's likes, newest first, and the count of all of them. */
export async function listLikedSkillRefs(
  db: D1Database,
  userId: number,
  page: { limit: number, offset: number },
): Promise<{ refs: LikedSkillRef[], total: number }> {
  const [rows, count] = await db.batch([
    db.prepare(
      `SELECT owner, repo, name, created_at AS likedAt
       FROM skill_likes
       WHERE user_id = ?1
       ORDER BY created_at DESC, owner, repo, name
       LIMIT ?2 OFFSET ?3`,
    ).bind(userId, page.limit, page.offset),
    db.prepare(`SELECT COUNT(*) AS total FROM skill_likes WHERE user_id = ?1`).bind(userId),
  ])
  return {
    refs: (rows?.results ?? []) as LikedSkillRef[],
    total: ((count?.results ?? [])[0] as { total: number } | undefined)?.total ?? 0,
  }
}
