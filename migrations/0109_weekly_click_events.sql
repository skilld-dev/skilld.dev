-- Clicks from the weekly email.
--
-- The email is the only surface with no analytics on it: once it leaves the
-- Worker we learn nothing, so "did anyone open a skill from the digest" has
-- been unanswerable. Every link in the email is rewritten to pass through
-- `/api/e/weekly`, which records a row here and redirects.
--
-- Destinations are stored as a site-relative path, never an absolute URL. The
-- redirect endpoint rebuilds the URL from the site origin, so the table cannot
-- describe an off-site redirect even if a row is forged. That is the whole
-- defence against this becoming an open redirect.
--
-- `user_id` is not a foreign key on purpose. A click can arrive weeks after the
-- send, and deleting an account should not delete the record that the email
-- worked. It is nullable for the same reason: a forwarded email has no
-- recipient we can name.
CREATE TABLE weekly_click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  -- The week the email was sent for, matching `weekly_runs.window_end`.
  window_end INTEGER NOT NULL,
  -- Which part of the email earned the click: liked, trending, cta, footer.
  placement TEXT NOT NULL,
  -- Site-relative destination, always starting with a single '/'.
  path TEXT NOT NULL,
  clicked_at INTEGER NOT NULL
);

-- The two questions this table exists to answer: how did one week perform, and
-- which destinations earn clicks across weeks.
CREATE INDEX weekly_click_events_window ON weekly_click_events (window_end, placement);
CREATE INDEX weekly_click_events_path ON weekly_click_events (path, clicked_at);
