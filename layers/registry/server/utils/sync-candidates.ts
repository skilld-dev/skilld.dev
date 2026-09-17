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
 * a recorded too-large tree verdict stay out: GitHub will truncate their tree
 * response on every attempt, so re-picking them only burns rate limit.
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
    )
  GROUP BY r.owner, r.repo, r.repo_meta_synced_at, dc.owner_verified
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC
  LIMIT ?2`

/**
 * General refreshes use the repo-level check timestamp. The old query returned
 * every repo every hour and sorted on skills.last_synced_at, which unchanged
 * repos never advanced; the same cold rows could therefore stay at the front
 * forever. EXISTS keeps empty/retired repo rows out without grouping skills.
 * Repos with a recorded too-large tree verdict stay out for the same reason
 * as the subscribed sweep above.
 */
export const GENERAL_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls,
         COALESCE(dc.owner_verified, 0) AS owner_verified
  FROM repos r INDEXED BY idx_repos_sync_due
  LEFT JOIN discovery_candidates dc
    ON dc.owner = r.owner AND dc.repo = r.repo
  WHERE r.broken_since IS NULL
    AND r.tree_truncated_at IS NULL
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC
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
