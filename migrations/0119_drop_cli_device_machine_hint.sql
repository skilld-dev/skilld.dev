-- The skilld CLI never sends a machine hint. Stop keeping a column that could
-- only ever hold device details about a person.
ALTER TABLE cli_device_sessions DROP COLUMN machine_hint;
