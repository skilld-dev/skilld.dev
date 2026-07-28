-- Opted-in users with no deliverable address claimed a digest window every
-- cycle and failed preflight with `missing_recipient`, which held the daily
-- health report at RED on a condition no operator action could clear.
-- Delivery opt-in without an address is not a reachable state any more, so the
-- rows that predate that rule are repaired to opted out. The dashboard already
-- shows `No email set`, so a user can opt back in once an address exists.
UPDATE users
SET email_opt_in = 0
WHERE email_opt_in = 1
  AND NULLIF(TRIM(COALESCE(digest_email, '')), '') IS NULL
  AND NULLIF(TRIM(COALESCE(email, '')), '') IS NULL;
