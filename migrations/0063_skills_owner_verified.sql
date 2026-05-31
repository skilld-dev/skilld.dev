-- Owner-verified: skills imported by an authenticated GitHub user from a repo
-- they own. Treated as a primary trust signal so they become indexable by
-- default (Loop 2 retention feeds Loop 1's curated catalog). Persisted as a
-- column so the nightly recompute-scores pass doesn't flip them back.
ALTER TABLE skills ADD COLUMN owner_verified INTEGER NOT NULL DEFAULT 0;
