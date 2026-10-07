-- Behavior reviews (ADR-0016). One row is a language model's reading of each
-- match of a behavior that needs approval, for one Skill folder at one commit.
--
-- An Artifact build writes a row the first time it reads a commit's matches.
-- Every later build of that commit reads the row instead of asking the model
-- again. The Skill page reads SKILL.md readings by the SKILL.md Git blob SHA.
-- Only public Skills have rows: private Skill text never goes to a model.
--
-- Cull path: drop the `behavior-review` check in a policy bump, drop the
-- `/api/behavior-readings` route, then `DROP TABLE behavior_reviews`.
CREATE TABLE IF NOT EXISTS behavior_reviews (
  repository_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  -- The rules digest and prompt version the review read under.
  rules_version TEXT NOT NULL,
  -- A digest of the model input: each match with its context. A row serves
  -- only the same input, and any build with that input copies its readings.
  hits_digest TEXT NOT NULL,
  skill_md_blob_sha TEXT,
  model TEXT NOT NULL,
  -- A JSON array of readings: path, line, behavior, lineHash, verdict, reason.
  readings_json TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (repository_id, commit_sha, skill_path, rules_version)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_behavior_reviews_skill_md
  ON behavior_reviews (skill_md_blob_sha, rules_version, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavior_reviews_input
  ON behavior_reviews (hits_digest, rules_version, created_at DESC);
