-- Per-version buckets for the from-version selector + per-version sections.
-- JSON array, newest-first: [{ version, buckets:{breaking,features,fixes,improvements:[]}, counts }].
-- The page deserializes this to recompute the [from → to] window client-side and
-- render per-version sections, instead of one whole-major aggregate.
ALTER TABLE npm_guides ADD COLUMN release_buckets TEXT;
