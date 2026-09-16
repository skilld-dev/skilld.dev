-- Weekly email links now point straight at pages. Nothing records which reader
-- clicked which link, so the per-reader click history is deleted.
DROP INDEX IF EXISTS weekly_click_events_window;
DROP INDEX IF EXISTS weekly_click_events_path;
DROP TABLE IF EXISTS weekly_click_events;
