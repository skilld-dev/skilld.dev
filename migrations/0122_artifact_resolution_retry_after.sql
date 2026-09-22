-- When GitHub refuses a read because its rate limit is spent, it says when the
-- quota returns. Keep that on the Resolution: it is the one piece of a
-- RATE_LIMITED failure an operator or a client can act on.
ALTER TABLE artifact_resolutions ADD COLUMN error_retry_after INTEGER;
