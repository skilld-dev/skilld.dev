-- Fixed-window counters for the auto-index trigger on repository reads.
-- One row per bucket: `client:<id>` for one caller, `global` for the site.
-- The counter is the only thing that bounds GitHub calls made on a read path,
-- so a crawler walking unknown /gh/:owner/:repo URLs cannot fan out without it.
CREATE TABLE auto_index_rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
);
