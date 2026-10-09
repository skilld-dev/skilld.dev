-- Keep author frontmatter across refreshes. Listing descriptions may contain
-- repository fallback text, so they cannot measure author descriptions.
-- No foreign key: removing a source must not erase its observed history.
CREATE TABLE skill_description_history (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_sha256 TEXT NOT NULL CHECK (length(raw_sha256) = 64),
  source_blob_sha TEXT NOT NULL,
  source_commit TEXT,
  source_path TEXT,
  frontmatter TEXT NOT NULL CHECK (json_valid(frontmatter)),
  first_observed_at INTEGER NOT NULL,
  last_observed_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo, name, raw_sha256),
  CHECK (first_observed_at <= last_observed_at)
);

INSERT INTO skill_description_history
  (owner,repo,name,raw_sha256,source_blob_sha,source_commit,source_path,
   frontmatter,first_observed_at,last_observed_at)
SELECT owner,repo,name,rendered_raw_sha256,current_sha,rendered_commit_sha,
       rendered_skill_path,rendered_frontmatter,rendered_at,rendered_at
FROM skills
WHERE rendered_status='ok' AND length(rendered_raw_sha256)=64
  AND current_sha IS NOT NULL AND rendered_at IS NOT NULL
  AND json_valid(rendered_frontmatter);

CREATE TRIGGER skill_description_history_insert AFTER INSERT ON skills
WHEN NEW.rendered_status='ok' AND length(NEW.rendered_raw_sha256)=64
  AND NEW.current_sha IS NOT NULL AND NEW.rendered_at IS NOT NULL
  AND json_valid(NEW.rendered_frontmatter)
BEGIN
  INSERT INTO skill_description_history
    (owner,repo,name,raw_sha256,source_blob_sha,source_commit,source_path,
     frontmatter,first_observed_at,last_observed_at)
  VALUES (NEW.owner,NEW.repo,NEW.name,NEW.rendered_raw_sha256,NEW.current_sha,
    NEW.rendered_commit_sha,NEW.rendered_skill_path,NEW.rendered_frontmatter,
    NEW.rendered_at,NEW.rendered_at)
  ON CONFLICT(owner,repo,name,raw_sha256) DO UPDATE SET
    first_observed_at=MIN(first_observed_at,excluded.first_observed_at),
    last_observed_at=MAX(last_observed_at,excluded.last_observed_at);
END;

CREATE TRIGGER skill_description_history_update
AFTER UPDATE OF rendered_raw_sha256,rendered_frontmatter,rendered_at ON skills
WHEN NEW.rendered_status='ok' AND length(NEW.rendered_raw_sha256)=64
  AND NEW.current_sha IS NOT NULL AND NEW.rendered_at IS NOT NULL
  AND json_valid(NEW.rendered_frontmatter)
BEGIN
  INSERT INTO skill_description_history
    (owner,repo,name,raw_sha256,source_blob_sha,source_commit,source_path,
     frontmatter,first_observed_at,last_observed_at)
  VALUES (NEW.owner,NEW.repo,NEW.name,NEW.rendered_raw_sha256,NEW.current_sha,
    NEW.rendered_commit_sha,NEW.rendered_skill_path,NEW.rendered_frontmatter,
    NEW.rendered_at,NEW.rendered_at)
  ON CONFLICT(owner,repo,name,raw_sha256) DO UPDATE SET
    first_observed_at=MIN(first_observed_at,excluded.first_observed_at),
    last_observed_at=MAX(last_observed_at,excluded.last_observed_at);
END;
