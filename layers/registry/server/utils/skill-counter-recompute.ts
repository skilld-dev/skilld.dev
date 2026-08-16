/**
 * Recomputes every denormalized counter on one skill from live rows.
 *
 * Formulas mirror the /admin/integrity drift checks exactly:
 *   curator_count          = collection_skills_v2 rows under non-deleted collections matched by full skill identity
 *   curator_reason_count   = same, filtered to rows with reason text length >= 20
 *   approved_social_count  = skill_social_posts rows with status='approved' matched by skill_slug
 *   author_social_count    = same, filtered to role='author'
 *   like_count             = skill_likes rows matched by full skill identity (ADR-0003)
 *
 * Bound as (?1 owner, ?2 repo, ?3 name). Exported so the arithmetic can be run
 * against a real database in a test without booting the scheduled task around it.
 */
export const SKILL_COUNTER_RECOMPUTE_SQL = `UPDATE skills
           SET
             curator_count = (
               SELECT COUNT(*)
               FROM collection_skills_v2 cs
               JOIN collections_v2 c ON c.id = cs.collection_id
               WHERE c.deleted_at IS NULL
                 AND cs.owner = skills.owner
                 AND cs.repo = skills.repo
                 AND cs.name = skills.name
             ),
             curator_reason_count = (
               SELECT COUNT(*)
               FROM collection_skills_v2 cs
               JOIN collections_v2 c ON c.id = cs.collection_id
               WHERE c.deleted_at IS NULL
                 AND cs.owner = skills.owner
                 AND cs.repo = skills.repo
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
             ),
             like_count = (
               SELECT COUNT(*)
               FROM skill_likes l
               WHERE l.owner = skills.owner
                 AND l.repo = skills.repo
                 AND l.name = skills.name
             )
           WHERE owner = ?1 AND repo = ?2 AND name = ?3`
