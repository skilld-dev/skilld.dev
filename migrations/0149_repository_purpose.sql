-- Repository purpose is machine evidence. It never grants human admission or SEO indexing.
CREATE TABLE repository_purpose (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('skill-pack','software','directory','mirror','uncertain')),
  probability REAL NOT NULL CHECK (probability BETWEEN 0 AND 1),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  model TEXT NOT NULL,
  model_id TEXT NOT NULL,
  source_commit TEXT NOT NULL CHECK (length(source_commit)=40 AND source_commit NOT GLOB '*[^0-9a-f]*'),
  prompt_version TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK (json_valid(evidence)),
  answer TEXT NOT NULL CHECK (json_valid(answer)),
  evaluated_at INTEGER NOT NULL,
  PRIMARY KEY (owner,repo)
);
CREATE INDEX repository_purpose_due_idx ON repository_purpose(evaluated_at);
