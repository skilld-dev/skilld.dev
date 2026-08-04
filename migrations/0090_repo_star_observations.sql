-- GitHub no longer exposes public stargazer timestamps. Record the exact
-- repository total once per UTC day during the existing metadata sync instead.
CREATE TABLE repo_star_observations (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  observed_day INTEGER NOT NULL CHECK (observed_day >= 0 AND observed_day % 86400 = 0),
  stars INTEGER NOT NULL CHECK (stars >= 0),
  PRIMARY KEY (owner, repo, observed_day),
  FOREIGN KEY (owner, repo) REFERENCES repos(owner, repo) ON DELETE CASCADE
);

-- Seed an honest starting point. Historical values before this migration are
-- unknown and deliberately remain absent.
INSERT INTO repo_star_observations (owner, repo, observed_day, stars)
SELECT owner, repo, CAST(unixepoch() / 86400 AS INTEGER) * 86400, stars
FROM repos;
