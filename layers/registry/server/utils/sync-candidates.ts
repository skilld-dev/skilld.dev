export interface RepoSyncCandidate {
  owner: string
  repo: string
  ls: number | null
}

/**
 * Subscribed repos get the short freshness window supplied by the caller.
 * Grouping collapses multiple subscribers watching the same repo.
 */
export const SUBSCRIBED_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls
  FROM repos r
  JOIN skill_subscriptions sub
    ON sub.owner = r.owner AND sub.repo = r.repo
  WHERE r.broken_since IS NULL
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
  GROUP BY r.owner, r.repo, r.repo_meta_synced_at
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC`

/**
 * General refreshes use the repo-level check timestamp. The old query returned
 * every repo every hour and sorted on skills.last_synced_at, which unchanged
 * repos never advanced; the same cold rows could therefore stay at the front
 * forever. EXISTS keeps empty/retired repo rows out without grouping skills.
 */
export const GENERAL_SYNC_CANDIDATES_SQL = `
  SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls
  FROM repos r
  WHERE r.broken_since IS NULL
    AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
    AND EXISTS (
      SELECT 1 FROM skills s
      WHERE s.owner = r.owner AND s.repo = r.repo
    )
  ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC`

export function prioritizeRepoSyncCandidates(
  subscribed: RepoSyncCandidate[],
  general: RepoSyncCandidate[],
  limit: number,
): { ordered: Array<{ owner: string, repo: string }>, deferred: number } {
  const all: Array<{ owner: string, repo: string }> = []
  const seen = new Set<string>()

  for (const row of [...subscribed, ...general]) {
    const key = `${row.owner}/${row.repo}`
    if (seen.has(key))
      continue
    seen.add(key)
    all.push({ owner: row.owner, repo: row.repo })
  }

  return {
    ordered: all.slice(0, limit),
    deferred: Math.max(0, all.length - limit),
  }
}
