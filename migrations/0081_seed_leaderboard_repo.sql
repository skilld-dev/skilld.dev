-- Ensure the initial leaderboard repository enters the normal GitHub sync
-- pipeline. Eligibility remains separate from discovery and ingestion.
INSERT OR IGNORE INTO discovery_candidates (
  owner,
  repo,
  source,
  first_discovered_at,
  last_discovered_at,
  outcome,
  retry_state,
  owner_verified
) VALUES (
  'harlan-zw',
  'harlan-agent-kit',
  'manual',
  unixepoch(),
  unixepoch(),
  'pending',
  'ready',
  0
);
