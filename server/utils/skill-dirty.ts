/// <reference types="@cloudflare/workers-types" />
import { retryIdempotentD1Write } from '#server/utils/db'

/**
 * Reason buckets supported by the skill_dirty queue.
 * - 'curator' covers collection_skills_v2 writes (affects curator_count, curator_reason_count)
 * - 'social'  covers skill_social_posts writes (affects approved_social_count, author_social_count)
 * - 'like'    covers skill_likes writes (affects like_count)
 *
 * A 5-minute scheduled task (drain-skill-dirty) recomputes all five columns
 * regardless of reason; the reason is recorded for observability and to keep
 * the dedupe key narrow per source-of-truth table.
 */
export type SkillDirtyReason = 'curator' | 'social' | 'like' | (string & {})

export interface SkillDirtyKey {
  owner: string
  repo: string
  name: string
  reason: SkillDirtyReason
}

/**
 * Enqueue an affected skill for counter recompute. Safe to call from inside
 * a D1 batch — accepts the same db handle. Uses INSERT OR REPLACE so a
 * second enqueue while a drain is pending simply refreshes queued_at and
 * keeps a single row per (skill, reason).
 *
 * Must be called for every UI/admin/background write that changes the rows
 * driving curator_count, curator_reason_count, approved_social_count,
 * author_social_count, or like_count. For DELETEs, call this with the previously-attached
 * (owner, repo, name) so the recompute can lower the counter.
 */
export async function enqueueSkillDirty(
  db: D1Database,
  key: SkillDirtyKey,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await retryIdempotentD1Write(() => db
    .prepare(
      `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
       VALUES (?1, ?2, ?3, ?4, ?5, 0)`,
    )
    .bind(key.owner, key.repo, key.name, key.reason, now)
    .run())
}

/**
 * Build the statement form for callers that prefer to include the enqueue
 * in an existing db.batch([...]) atomic group rather than firing a separate
 * round-trip. Same INSERT OR REPLACE semantics as enqueueSkillDirty.
 */
export function enqueueSkillDirtyStatement(
  db: D1Database,
  key: SkillDirtyKey,
): D1PreparedStatement {
  const now = Math.floor(Date.now() / 1000)
  return db
    .prepare(
      `INSERT OR REPLACE INTO skill_dirty (owner, repo, name, reason, queued_at, attempts)
       VALUES (?1, ?2, ?3, ?4, ?5, 0)`,
    )
    .bind(key.owner, key.repo, key.name, key.reason, now)
}
