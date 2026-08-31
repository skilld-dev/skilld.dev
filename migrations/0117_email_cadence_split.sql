-- One row per Skill included in an accepted weekly edition. The weekly loader
-- uses this history to hold a Skill back for 60 days after it appears.
CREATE TABLE weekly_skill_sends (
  window_end INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (window_end, owner, repo, name)
);

CREATE INDEX weekly_skill_sends_recent
  ON weekly_skill_sends (sent_at DESC, owner, repo, name);

-- The digest now has one fixed monthly schedule. Existing per-person cadence
-- fields remain stored but no longer control delivery.
UPDATE sync_jobs
SET cron = '0 9 1 * *',
    stale_after_seconds = 3024000
WHERE name = 'send-digests';

-- The old per-person schedule treated cadence Off as the unsubscribe switch,
-- and turning it Off left `email_opt_in` at 1. The monthly cron now sends to
-- every opted-in user, so those rows must carry Off as a real opt-out.
-- Repair follows 0082: the dashboard shows the switch, so opting back in is
-- one deliberate click.
UPDATE users
SET email_opt_in = 0
WHERE digest_frequency = 'off'
  AND email_opt_in = 1;
