-- The agent setup picker lets a user copy a command for a specific agent and a
-- specific mode (project, global, or one-off with no install). Without these
-- columns every copy looks identical, so we cannot tell which mode converts.
-- Both are nullable: the primary copy button records neither.
ALTER TABLE install_events ADD COLUMN agent TEXT;
ALTER TABLE install_events ADD COLUMN mode TEXT;

CREATE INDEX IF NOT EXISTS idx_install_events_agent_mode ON install_events (agent, mode);
