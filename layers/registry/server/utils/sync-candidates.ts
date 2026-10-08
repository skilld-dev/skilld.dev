export interface RepoSyncCandidate {
  owner: string
  repo: string
  ls: number | null
  owner_verified?: number
}

interface RepoSyncPriorityOptions {
  limit: number
  generalReserve: number
}

interface HistoricalDiscoveryStageOptions extends RepoSyncPriorityOptions {
  maxHistorical: number
}

/**
 * Subscribed repos get the short freshness window supplied by the caller.
 * Grouping collapses multiple subscribers watching the same repo. Repos with
 * a recorded too-large tree verdict use the slower general refresh pool.
 * Their bounded subtree fallback costs more reads than a normal tree fetch.
 */
export const SUBSCRIBED_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls,
         COALESCE(dc.owner_verified, 0) AS owner_verified
  FROM repos r INDEXED BY idx_repos_sync_due
  JOIN skill_subscriptions sub
    ON sub.owner = r.owner AND sub.repo = r.repo
  LEFT JOIN discovery_candidates dc
    ON dc.owner = r.owner AND dc.repo = r.repo
  WHERE r.broken_since IS NULL
    AND r.tree_truncated_at IS NULL
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
        AND COALESCE(s.sync_status, '') != 'path_missing'
    )
  GROUP BY r.owner, r.repo, r.repo_meta_synced_at, dc.owner_verified
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC
  LIMIT ?2`

/**
 * General refreshes use the repo-level check timestamp. The old query returned
 * every repo every hour and sorted on skills.last_synced_at, which unchanged
 * repos never advanced; the same cold rows could therefore stay at the front
 * forever. EXISTS keeps empty/retired repo rows out without grouping skills.
 * A repo whose every row is `path_missing` has no Skills left: its tree was
 * readable but held none, so it is not broken and not refreshed either.
 * Truncated repositories retry on this slower clock. The tree reader now
 * resolves truncated responses through bounded immutable subtree reads.
 * Public references without a source commit lead this pool until repaired.
 */
export const GENERAL_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls,
         COALESCE(dc.owner_verified, 0) AS owner_verified
  FROM repos r INDEXED BY idx_repos_sync_due
  LEFT JOIN discovery_candidates dc
    ON dc.owner = r.owner AND dc.repo = r.repo
  WHERE r.broken_since IS NULL
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
        AND COALESCE(s.sync_status, '') != 'path_missing'
    )
  ORDER BY EXISTS (
    SELECT 1 FROM skills s
    WHERE s.owner = r.owner AND s.repo = r.repo
      AND s.seo_indexable = 1 AND s.references_count > 0
      AND s.rendered_commit_sha IS NULL
      AND COALESCE(s.sync_status, '') != 'path_missing'
  ) DESC, r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC
  LIMIT ?2`

/**
 * Render-repair sweep for skills whose rendered content identity is missing or
 * not ok, oldest sync first. Keeps the same repo verdicts as the sync sweeps
 * above: a repo carrying a too-large tree verdict truncates on every attempt,
 * so a render job for it can never succeed and re-picking it every fire only
 * produces guaranteed failures. Every successful repo write clears the verdict
 * (sync-repo.ts), so an affected skill re-enters this sweep once its repo is
 * fetchable again.
 */
export const RECONCILE_RENDER_CANDIDATES_SQL = `
  SELECT DISTINCT s.owner, s.repo
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  WHERE (s.rendered_status IS NULL OR s.rendered_status != 'ok' OR s.rendered_skill_path IS NULL OR s.rendered_raw_sha256 IS NULL)
    AND (s.last_synced_at IS NULL OR s.last_synced_at < ?1)
    AND COALESCE(s.sync_status, '') != 'path_missing'
    AND r.broken_since IS NULL
    AND r.tree_truncated_at IS NULL
  ORDER BY s.last_synced_at IS NULL DESC, s.last_synced_at ASC
  LIMIT ?2`

/**
 * Re-verification sweep for repos carrying a broken verdict. Every pool above
 * filters `broken_since IS NULL`, so a single transient 404 would otherwise
 * quarantine a repository's skills forever: nothing ever re-checks the
 * verdict. This sweep hands a repo one cheap re-check once it has stayed
 * broken past the caller's TTL, longest-broken first. The cooldown reads the
 * repo's last check time rather than `broken_since` itself, because
 * markRepoMissing keeps the original break timestamp but advances
 * `repo_meta_synced_at` on every failed re-check, so a permanently deleted
 * repository is re-attempted at most once per TTL instead of every sweep.
 * Callers append these rows behind every live pool, so the small LIMIT only
 * ever spends slots a live sync did not want.
 */
export const REVERIFY_BROKEN_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.broken_since AS ls,
         COALESCE(dc.owner_verified, 0) AS owner_verified
  FROM repos r INDEXED BY repos_broken_idx
  LEFT JOIN discovery_candidates dc
    ON dc.owner = r.owner AND dc.repo = r.repo
  WHERE r.broken_since <= ?1
    AND COALESCE(r.repo_meta_synced_at, r.broken_since) <= ?1
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
  ORDER BY r.broken_since ASC, r.owner ASC, r.repo ASC
  LIMIT ?2`

/**
 * Candidate rows do not depend on an admitted skill. Stale claims are made
 * due again so a terminated Worker cannot strand a repository permanently.
 */
export const DISCOVERY_SYNC_CANDIDATES_SQL = `
  SELECT owner, repo, last_discovered_at AS ls, owner_verified
  FROM discovery_candidates INDEXED BY idx_discovery_candidates_due
  WHERE retry_state IN ('ready', 'retry_scheduled')
    AND (next_retry_at IS NULL OR next_retry_at <= ?1)
  UNION ALL
  SELECT owner, repo, last_discovered_at AS ls, owner_verified
  FROM discovery_candidates INDEXED BY idx_discovery_candidates_due
  WHERE retry_state = 'claimed'
    AND claimed_at <= ?2
  ORDER BY ls ASC, owner ASC, repo ASC
  LIMIT ?3`

/**
 * Migration 0070 deliberately did not enqueue thousands of historical rows in
 * one deployment transaction. Stage that inventory in bounded hourly slices
 * so every unbroken skill-less repo eventually receives an explicit outcome.
 */
export const STAGE_HISTORICAL_DISCOVERY_CANDIDATES_SQL = `
  INSERT INTO discovery_candidates (
    owner, repo, source, first_discovered_at, last_discovered_at,
    outcome, retry_state, owner_verified
  )
  SELECT r.owner, r.repo, 'historical_inventory', ?1, ?1, 'pending', 'ready', 0
  FROM repos r
  WHERE r.broken_since IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
    AND NOT EXISTS (
      SELECT 1 FROM discovery_candidates dc
      WHERE dc.owner = r.owner AND dc.repo = r.repo
    )
  ORDER BY COALESCE(r.repo_meta_synced_at, 0) ASC, r.owner ASC, r.repo ASC
  LIMIT ?2`

export function prioritizeRepoSyncCandidates(
  subscribed: RepoSyncCandidate[],
  general: RepoSyncCandidate[],
  discovery: RepoSyncCandidate[],
  options: RepoSyncPriorityOptions,
): { ordered: Array<{ owner: string, repo: string, ownerVerified: boolean }>, deferred: number } {
  const categories = candidateCategories(subscribed, general, discovery)
  const ordered: Array<{ owner: string, repo: string, ownerVerified: boolean }> = []
  const add = (rows: RepoSyncCandidate[], max = Number.POSITIVE_INFINITY) => {
    const count = Math.min(max, rows.length, options.limit - ordered.length)
    for (const row of rows.slice(0, count)) {
      ordered.push({
        owner: row.owner,
        repo: row.repo,
        ownerVerified: categories.ownerVerified.get(candidateKey(row)) === true,
      })
    }
  }

  add(categories.subscribed)
  const remaining = Math.max(0, options.limit - ordered.length)
  const generalTarget = Math.min(options.generalReserve, categories.general.length, remaining)
  const discoveryTarget = Math.max(0, remaining - generalTarget)
  add(categories.discovery, discoveryTarget)
  add(categories.general)
  add(categories.discovery.slice(discoveryTarget))

  return {
    ordered,
    deferred: Math.max(0, categories.total - ordered.length),
  }
}

export interface RepoReverificationAppendOptions {
  limit: number
  maxReverified: number
}

/**
 * Re-verification is the lowest-priority work in a sweep. Re-check rows only
 * join the queue through slots the live pools left free, and never more than
 * `maxReverified` per run, so a backlog of long-broken repositories cannot
 * crowd out fresh syncs. Rows already queued by a live pool are skipped.
 */
export function appendRepoReverificationCandidates(
  ordered: Array<{ owner: string, repo: string, ownerVerified: boolean }>,
  reverify: RepoSyncCandidate[],
  options: RepoReverificationAppendOptions,
): Array<{ owner: string, repo: string, ownerVerified: boolean }> {
  const queued = new Set(ordered.map(row => candidateKey(row)))
  const freeSlots = Math.max(0, options.limit - ordered.length)
  const appended: Array<{ owner: string, repo: string, ownerVerified: boolean }> = []
  for (const row of reverify) {
    if (appended.length >= Math.min(options.maxReverified, freeSlots))
      break
    const key = candidateKey(row)
    if (queued.has(key))
      continue
    queued.add(key)
    appended.push({
      owner: row.owner,
      repo: row.repo,
      ownerVerified: row.owner_verified === 1,
    })
  }
  return [...ordered, ...appended]
}

export function historicalDiscoveryStageCapacity(
  subscribed: RepoSyncCandidate[],
  general: RepoSyncCandidate[],
  discovery: RepoSyncCandidate[],
  options: HistoricalDiscoveryStageOptions,
): number {
  const categories = candidateCategories(subscribed, general, discovery)
  const subscriberSlots = Math.min(categories.subscribed.length, options.limit)
  const remaining = Math.max(0, options.limit - subscriberSlots)
  const generalTarget = Math.min(options.generalReserve, categories.general.length, remaining)
  const discoveryCapacity = Math.max(0, remaining - generalTarget)
  return Math.min(
    options.maxHistorical,
    Math.max(0, discoveryCapacity - categories.discovery.length),
  )
}

function candidateCategories(
  subscribed: RepoSyncCandidate[],
  general: RepoSyncCandidate[],
  discovery: RepoSyncCandidate[],
): {
  subscribed: RepoSyncCandidate[]
  discovery: RepoSyncCandidate[]
  general: RepoSyncCandidate[]
  ownerVerified: Map<string, boolean>
  total: number
} {
  const ownerVerified = new Map<string, boolean>()
  for (const row of [...subscribed, ...discovery, ...general]) {
    const key = candidateKey(row)
    ownerVerified.set(key, ownerVerified.get(key) === true || row.owner_verified === 1)
  }

  const seen = new Set<string>()
  const unique = (rows: RepoSyncCandidate[]): RepoSyncCandidate[] => rows.filter((row) => {
    const key = candidateKey(row)
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
  const subscribedRows = unique(subscribed)
  const discoveryRows = unique(discovery)
  const generalRows = unique(general)
  return {
    subscribed: subscribedRows,
    discovery: discoveryRows,
    general: generalRows,
    ownerVerified,
    total: seen.size,
  }
}

function candidateKey(candidate: Pick<RepoSyncCandidate, 'owner' | 'repo'>): string {
  return `${candidate.owner}/${candidate.repo}`
}
