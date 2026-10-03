-- Machine screening for the default directory. Independent of human admission.
-- Missing or uncertain decisions stay searchable but do not enter this browse.
CREATE TABLE skill_repo_focus (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  probability REAL NOT NULL CHECK (probability BETWEEN 0 AND 1),
  model TEXT NOT NULL,
  evidence TEXT NOT NULL CHECK (json_valid(evidence)),
  evaluated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);
