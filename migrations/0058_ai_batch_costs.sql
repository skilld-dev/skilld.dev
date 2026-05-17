-- Per-batch cost log for the Anthropic Message Batches submitted by
-- ai-generate-submit. One row per batch; populated on submit with the
-- request shape, then updated on poll completion with token usage and
-- estimated USD cost (Haiku 4.5 batch rates: $0.50/MTok in, $2.50/MTok out).
-- No alerting or budgets — just visibility on /admin/integrity so we can
-- see weekly regen spend.
CREATE TABLE IF NOT EXISTS ai_batch_costs (
  anthropic_batch_id TEXT PRIMARY KEY,
  skill_count INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  est_cost_usd REAL
);

CREATE INDEX IF NOT EXISTS idx_ai_batch_costs_submitted ON ai_batch_costs(submitted_at);
