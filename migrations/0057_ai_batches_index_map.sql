-- Move the AI batch index map from KV (48h TTL, lossy) onto the row itself.
-- The index map resolves Anthropic batch result `custom_id` values back to
-- (owner, repo, name, sha). Anthropic batches can run up to 24h; KV TTL plus
-- polling gaps risked losing the map and dropping results. Storing on the
-- row removes that failure mode.
ALTER TABLE ai_batches ADD COLUMN index_map TEXT;
