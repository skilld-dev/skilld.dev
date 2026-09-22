-- Two switches, both on by default, both the account's to turn off.
--
-- `likes_public` keeps /@login/liked public, which is how it already worked,
-- and gives the owner a way to close it.
--
-- `repo_indexing` keeps the sign-in scan of an account's public repositories,
-- which is how the registry grows. An account that turns it off gets no
-- further scan.
ALTER TABLE users ADD COLUMN likes_public INTEGER NOT NULL DEFAULT 1 CHECK (likes_public IN (0, 1));
ALTER TABLE users ADD COLUMN repo_indexing INTEGER NOT NULL DEFAULT 1 CHECK (repo_indexing IN (0, 1));
