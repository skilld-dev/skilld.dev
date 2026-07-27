-- Registry URLs keep their first admitted owner/repo identity. GitHub may later
-- rename or transfer the repository, so retain the canonical source identity
-- separately for fetches without invalidating public URLs.
ALTER TABLE repos ADD COLUMN source_owner TEXT;
ALTER TABLE repos ADD COLUMN source_repo TEXT;
