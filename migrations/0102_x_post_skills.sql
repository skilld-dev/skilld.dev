-- Skill-grained mentions: which individual skill a post named.
--
-- Trending was repo-grained, which is the wrong unit. A post says "try
-- /show-me", not "try humanlayer/skills", and ranking repos meant a
-- five-skill repo and a one-skill repo competed as equals while the skill
-- someone actually named was invisible.
--
-- A row here is a VERIFIED match: the name was found in a SKILL.md inside a
-- repo the post linked. Candidates that fail verification are never stored,
-- because unverified names are mostly slash-commands (/spec, /plan, /build)
-- and filler words, measured at 20 rejects against 10 real matches.
--
-- `slug` is the directory-derived identity used in URLs. `canonical_name` is
-- the frontmatter `name:`, which is what the author calls the skill and what
-- the UI should show. They differ more often than expected:
--   kunpai/mars-claude        dir mars-claude       name mars-review
--   danyuchn/asd-ste100-skill dir asd-ste100-skill  name asd-ste100
CREATE TABLE x_post_skills (
  post_id TEXT NOT NULL REFERENCES x_posts(post_id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  slug TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  -- How the post referred to the skill: '/name', prose, or an install command.
  detection TEXT NOT NULL CHECK (detection IN ('slash', 'prose', 'install')),
  -- Which index confirmed it, kept for provenance when a match looks wrong.
  matched_on TEXT NOT NULL CHECK (matched_on IN ('registry', 'directory', 'frontmatter')),
  verified_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, owner, repo, slug)
);

-- The trending read: every mention of one skill, newest first.
CREATE INDEX idx_x_post_skills_skill ON x_post_skills (owner, repo, slug);
-- Time-windowed ranking joins back to x_posts on this.
CREATE INDEX idx_x_post_skills_post ON x_post_skills (post_id);

-- Marks a post as having been through skill detection, so the GitHub work is
-- done once rather than every quarter hour.
--
-- Deliberately left NULL when verification could not reach GitHub. A rate
-- limited lookup is not evidence that a post names no skill, and recording it
-- as scanned would lose that post permanently. Only a definite answer, match
-- or no-match, marks the post done.
ALTER TABLE x_posts ADD COLUMN skills_scanned_at INTEGER;

CREATE INDEX idx_x_posts_skill_scan ON x_posts (posted_at DESC) WHERE skills_scanned_at IS NULL;
