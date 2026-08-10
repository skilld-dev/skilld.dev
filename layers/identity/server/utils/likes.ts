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
): Promise<void> {
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
}

export async function unlikeSkill(
  db: D1Database,
  userId: number,
  ref: SkillLikeRef,
): Promise<void> {
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
}
