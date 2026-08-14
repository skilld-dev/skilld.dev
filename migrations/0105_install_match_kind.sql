-- Record when a post carried an install command for a repository.
--
-- `match_kind` distinguished a GitHub link from a skilld link. Neither
-- describes the strongest reference a post can make: `npx skills add
-- owner/repo` is an instruction to run something, not a citation of it.
--
-- The distinction earns its keep downstream. A repository holding exactly one
-- skill, named by an install command, identifies that skill unambiguously,
-- which is the same accuracy gate `trending-skills.ts` applies to star surges.
-- A plain link cannot support that inference: linking a repo is not installing
-- it.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt.
CREATE TABLE x_post_repos_new (
  post_id TEXT NOT NULL REFERENCES x_posts(post_id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('link', 'skilld', 'install')),
  PRIMARY KEY (post_id, owner, repo)
);

INSERT INTO x_post_repos_new (post_id, owner, repo, match_kind)
SELECT post_id, owner, repo, match_kind FROM x_post_repos;

DROP TABLE x_post_repos;
ALTER TABLE x_post_repos_new RENAME TO x_post_repos;

CREATE INDEX idx_x_post_repos_repo ON x_post_repos (owner, repo);
