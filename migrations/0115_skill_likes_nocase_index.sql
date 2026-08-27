-- Badge URLs accept mixed case. Match that collation so badge counts use an index search.
CREATE INDEX idx_skill_likes_skill_nocase
ON skill_likes(owner COLLATE NOCASE, repo COLLATE NOCASE, name COLLATE NOCASE);
