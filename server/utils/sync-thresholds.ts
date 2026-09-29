/**
 * Unified staleness thresholds for sync / refresh logic across the app.
 *
 * Every magic-number cutoff that gates a sync, render refresh, or freshness
 * check lives here so the admin integrity dashboard and the tasks that emit
 * those signals agree on what "stale" means.
 *
 * All values are seconds.
 */

/** skills.last_synced_at: rows older than this are flagged as stale in /admin/integrity. */
export const STALE_SYNC_SECONDS = 36 * 3600

/** skills.seo_index_synced_at: indexability scoring older than this is stale. */
export const STALE_INDEXABILITY_SECONDS = 24 * 3600

/** repos.broken_since: broken rows stay visible inside this grace window. */
export const BROKEN_GRACE_SECONDS = 7 * 86400

/**
 * repos.broken_since: a repo still broken after this gets one bounded
 * re-check per sweep via REVERIFY_BROKEN_SYNC_CANDIDATES_SQL. Kept well
 * inside BROKEN_GRACE_SECONDS so a transient 404 recovers before its skills
 * leave the site.
 */
export const BROKEN_REPO_REVERIFY_SECONDS = 48 * 3600

/** reconcile-rendered task: re-sync rows with non-ok rendered_status older than this. */
export const RECONCILE_RENDER_STALE_SECONDS = 6 * 3600

/** sync-github-skills: subscription-prioritised pre-pass picks up subscribed repos stalest than this. */
export const SUBSCRIBED_REPO_STALE_SECONDS = 3600
