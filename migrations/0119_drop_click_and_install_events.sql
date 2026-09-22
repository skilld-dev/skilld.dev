-- Weekly email links now point straight at pages, and copying a command no
-- longer records an event. The per-reader click history and the install copy
-- history are deleted.
DROP INDEX IF EXISTS weekly_click_events_window;
DROP INDEX IF EXISTS weekly_click_events_path;
DROP TABLE IF EXISTS weekly_click_events;

DROP INDEX IF EXISTS idx_install_events_recent;
DROP INDEX IF EXISTS idx_install_events_skill;
DROP INDEX IF EXISTS idx_install_events_collection;
DROP INDEX IF EXISTS idx_install_events_agent_mode;
DROP TABLE IF EXISTS install_events;
