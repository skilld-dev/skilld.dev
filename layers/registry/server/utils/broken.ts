// Broken-window predicate. After 0034, `broken_since` lives on `repos`, so
// the predicate has to be told which alias the caller used for the joined
// repos row (typical: `r`).
//
// Rows flagged broken less than 7 days ago stay visible (grace period for
// transient upstream issues). After that they fall off listings, search, and
// sitemaps, but the detail page remains reachable so deep links don't 404.

export const BROKEN_GRACE_SECONDS = 7 * 86400

export function notBrokenSql(reposAlias: string): string {
  return `(${reposAlias}.broken_since IS NULL OR ${reposAlias}.broken_since > unixepoch() - ${BROKEN_GRACE_SECONDS})`
}

export function notAggregatorSql(reposAlias: string): string {
  return `${reposAlias}.repo_kind != 'aggregator'`
}

// Standard JOIN clause for callers reading `skills s` plus repo facts.
export const JOIN_REPOS_SQL = 'JOIN repos r ON r.owner = s.owner AND r.repo = s.repo'
