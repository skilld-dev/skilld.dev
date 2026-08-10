-- Liking is the single per-skill primitive (ADR-0003). It replaces both the
-- "Save to collection" popover and the "Watch for changes" button.
--
-- Likes are skill-grained; the repo-level digest subscription is derived from
-- them. A like upserts a skill_subscriptions row with source='like'; unliking
-- the last liked skill in a repo drops that row, but only when its source is
-- 'like', so a 'manual' or 'star-import' watch is never clobbered.
CREATE TABLE skill_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, owner, repo, name)
);

-- Counter recompute (drain-skill-dirty) and the public /@login/liked list.
CREATE INDEX idx_skill_likes_skill ON skill_likes(owner, repo, name);
-- Per-user list, and the 200/day rate cap's created_at range scan.
CREATE INDEX idx_skill_likes_user ON skill_likes(user_id, created_at DESC);

-- Denormalized, recomputed by the skill_dirty queue exactly like curator_count.
ALTER TABLE skills ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_skills_like_count ON skills(like_count DESC);
