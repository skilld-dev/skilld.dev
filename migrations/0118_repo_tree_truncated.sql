-- GitHub truncates tree responses past roughly 100k entries or 7 MB. That
-- outcome is a property of the repository, not a transient failure: every
-- hourly sweep re-picked these repos, paid the same GitHub calls, and failed
-- identically because the verdict was never recorded on the repo row. Store
-- it so the sync candidate queries can skip the repository, and clear it on
-- the next successful repo write so a repo that becomes fetchable returns to
-- the normal freshness cycle.
ALTER TABLE repos ADD COLUMN tree_truncated_at INTEGER;
