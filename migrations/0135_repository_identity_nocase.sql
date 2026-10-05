-- Resolve GitHub spelling without changing frozen registry identities.
CREATE INDEX idx_repos_identity_nocase ON repos(owner COLLATE NOCASE, repo COLLATE NOCASE);
