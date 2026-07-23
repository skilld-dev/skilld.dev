export interface RepoSyncCandidate {
  owner: string
  repo: string
  ls: number | null
  owner_verified?: number
}

/**
 * Subscribed repos get the short freshness window supplied by the caller.
 * Grouping collapses multiple subscribers watching the same repo.
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
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
  GROUP BY r.owner, r.repo, r.repo_meta_synced_at, dc.owner_verified
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC`

/**
 * General refreshes use the repo-level check timestamp. The old query returned
 * every repo every hour and sorted on skills.last_synced_at, which unchanged
 * repos never advanced; the same cold rows could therefore stay at the front
 * forever. EXISTS keeps empty/retired repo rows out without grouping skills.
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
    )
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC`

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
  ORDER BY ls ASC, owner ASC, repo ASC`

export function prioritizeRepoSyncCandidates(
  subscribed: RepoSyncCandidate[],
  general: RepoSyncCandidate[],
  discovery: RepoSyncCandidate[],
  limit: number,
): { ordered: Array<{ owner: string, repo: string, ownerVerified: boolean }>, deferred: number } {
  const all: Array<{ owner: string, repo: string, ownerVerified: boolean }> = []
  const seen = new Map<string, number>()

  for (const row of [...subscribed, ...general, ...discovery]) {
    const key = `${row.owner}/${row.repo}`
    const existingIndex = seen.get(key)
    if (existingIndex != null) {
      if (row.owner_verified === 1)
        all[existingIndex]!.ownerVerified = true
      continue
    }
    seen.set(key, all.length)
    all.push({ owner: row.owner, repo: row.repo, ownerVerified: row.owner_verified === 1 })
  }

  return {
    ordered: all.slice(0, limit),
    deferred: Math.max(0, all.length - limit),
  }
}
