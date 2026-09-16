-- /@login/liked was public for every account, and nobody chose that.
-- The list is now private unless its owner turns it on. Existing accounts get
-- the same private default, because they never gave consent either.
ALTER TABLE users ADD COLUMN likes_public INTEGER NOT NULL DEFAULT 0 CHECK (likes_public IN (0, 1));
