/// <reference types="@cloudflare/workers-types" />

import { reportJobRun } from '~~/server/utils/sync-job-reporter'
import {
  recomputeIndexabilityForSkill,
  recomputeTrustForSkill,
} from '../utils/recompute-scores'

const BATCH = 200
const CRON = '*/5 * * * *'

interface DirtyRow {
  owner: string
  repo: string
  name: string
}

/**
 * Scheduled task: drain the skill_dirty queue and recompute the four
 * denormalized counters on the `skills` table that drift silently when UI
 * writes update collection_skills_v2 or skill_social_posts but never touch
 * the parent skill row:
 *   - curator_count
 *   - curator_reason_count
 *   - approved_social_count
 *   - author_social_count
 *
 * The recompute formula MUST match the drift checks in
 * `layers/admin/server/api/admin/integrity.get.ts` (curator-count-drift,
 * social-count-drift). If those queries change, this task changes too.
 *
 * Runs every 5 minutes. Picks up to BATCH distinct (owner, repo, name)
 * tuples ordered by queued_at, recomputes the four counters in a single
 * UPDATE per skill using correlated subqueries against the live source
 * tables, then deletes the drained rows from skill_dirty.
 */
export default defineTask({
  meta: {
    name: 'drain-skill-dirty',
    description: 'Recompute drifted curator/social counters on skills from the skill_dirty queue',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[drain-skill-dirty] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const startedAt = Date.now()
    const picked = await db
      .prepare(
        `SELECT owner, repo, name, MIN(queued_at) AS queued_at
         FROM skill_dirty
         GROUP BY owner, repo, name
         ORDER BY queued_at ASC
         LIMIT ?1`,
      )
      .bind(BATCH)
      .all<DirtyRow & { queued_at: number }>()

    const rows = picked.results ?? []
    if (!rows.length)
      return { result: { drained: 0 } }

    let updated = 0
    let failed = 0
    const successful: DirtyRow[] = []
    for (const { owner, repo, name } of rows) {
      // Single UPDATE that pulls live counts via correlated subqueries.
      // Formulas mirror /admin/integrity drift checks exactly:
      //   curator_count          = collection_skills_v2 rows under non-deleted collections matched by (owner, name)
      //   curator_reason_count   = same, filtered to rows with reason text length >= 20
      //   approved_social_count  = skill_social_posts rows with status='approved' matched by skill_slug
      //   author_social_count    = same, filtered to role='author'
      await db
        .prepare(
          `UPDATE skills
           SET
             curator_count = (
               SELECT COUNT(*)
               FROM collection_skills_v2 cs
               JOIN collections_v2 c ON c.id = cs.collection_id
               WHERE c.deleted_at IS NULL
                 AND cs.owner = skills.owner
                 AND cs.name = skills.name
             ),
             curator_reason_count = (
               SELECT COUNT(*)
               FROM collection_skills_v2 cs
               JOIN collections_v2 c ON c.id = cs.collection_id
               WHERE c.deleted_at IS NULL
                 AND cs.owner = skills.owner
                 AND cs.name = skills.name
                 AND length(trim(COALESCE(cs.reason, ''))) >= 20
             ),
             approved_social_count = (
               SELECT COUNT(*)
               FROM skill_social_posts sp
               WHERE sp.skill_slug = skills.slug
                 AND sp.status = 'approved'
             ),
             author_social_count = (
               SELECT COUNT(*)
               FROM skill_social_posts sp
               WHERE sp.skill_slug = skills.slug
                 AND sp.status = 'approved'
                 AND sp.role = 'author'
             )
           WHERE owner = ?1 AND repo = ?2 AND name = ?3`,
        )
        .bind(owner, repo, name)
        .run()
        .then(async () => {
          // Counters just moved; re-score indexability + trust for this
          // skill so seo_index_score / trust_tier track the new inputs.
          // Indexability writes both sets of columns in one UPDATE; trust
          // helper is a no-op when indexability already covered the change.
          await recomputeIndexabilityForSkill(db, { owner, repo, name })
          await recomputeTrustForSkill(db, { owner, repo, name })
          updated++
          successful.push({ owner, repo, name })
        })
        .catch(async (err) => {
          failed++
          console.warn(`[drain-skill-dirty] recompute failed for ${owner}/${repo}/${name}:`, err)
          await db
            .prepare(
              `UPDATE skill_dirty SET attempts = attempts + 1
               WHERE owner = ?1 AND repo = ?2 AND name = ?3`,
            )
            .bind(owner, repo, name)
            .run()
            .catch((updateErr) => {
              console.warn(`[drain-skill-dirty] failed to bump attempts for ${owner}/${repo}/${name}:`, updateErr)
            })
        })
    }

    // Only delete the rows we successfully recomputed. Failed ones stay
    // queued (with bumped attempts) for the next drain to retry.
    if (successful.length) {
      const deletes = successful.map(({ owner, repo, name }) =>
        db.prepare(
          `DELETE FROM skill_dirty WHERE owner = ?1 AND repo = ?2 AND name = ?3`,
        ).bind(owner, repo, name),
      )
      await db.batch(deletes).catch((err) => {
        console.warn('[drain-skill-dirty] cleanup delete failed:', err)
      })
    }

    await reportJobRun(db, 'drain-skill-dirty', {
      cron: CRON,
      status: failed > 0 ? (updated > 0 ? 'partial' : 'error') : 'ok',
      durationMs: Date.now() - startedAt,
      error: failed > 0 ? `${failed} recomputes failed` : null,
    })
    return { result: { drained: updated, failed, scanned: rows.length } }
  },
})
