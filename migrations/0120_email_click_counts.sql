-- Aggregate click counts for the weekly and digest emails.
--
-- 0118 dropped `weekly_click_events`, which stored one row per click with the
-- reader's id. Loop 2 still needs digest click-throughs as evidence, so this
-- table keeps a daily counter per link instead. Email links carry no reader
-- and no per-send id, and no row here names a person, address, or client.
--
-- `issue` is the send's `window_end`, shared by every recipient of that send.
-- `path` is site-relative with no query or fragment.
CREATE TABLE email_click_counts (
  day TEXT NOT NULL,
  campaign TEXT NOT NULL CHECK (campaign IN ('weekly', 'digest')),
  issue INTEGER NOT NULL,
  placement TEXT NOT NULL,
  path TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, campaign, issue, placement, path)
);

-- The admin report reads one issue at a time.
CREATE INDEX email_click_counts_issue ON email_click_counts (campaign, issue);
