-- Hold oversized repos out of auto-indexing until a human looks at them.
--
-- Discovery auto-submits what it finds, which is right for the ordinary case:
-- of 246 repos measured from one day of X posts, 198 held 20 skills or fewer
-- and are exactly the curated signal the registry wants.
--
-- The tail is the problem. Eight of those repos carried 84% of all discovered
-- SKILL.md files, and `sickn33/agentic-awesome-skills` alone holds 6,341 of
-- them. The largest legitimately curated repo in the registry has 18. Auto
-- indexing one aggregator dump would therefore add sixty times the entire
-- curated registry from a single tweet, which is the scaled-content shape that
-- suppressed the site to 0.6% indexed in June 2026, and the volume-play
-- posture `brand-guidelines.md` names as the foil.
--
-- `skill_count` records what the guard measured, so the review list can be
-- ranked by how much a repo would add. `held_reason` is NULL for anything
-- eligible to auto-submit; a non-NULL value means the row is parked and
-- waiting on a person.
ALTER TABLE discovery_ledger ADD COLUMN skill_count INTEGER;
ALTER TABLE discovery_ledger ADD COLUMN held_reason TEXT;

-- The submit path's hot query: pending rows that are not parked, strongest
-- evidence first. Partial so the parked tail costs nothing to skip.
CREATE INDEX idx_discovery_ledger_submittable
  ON discovery_ledger (evidence_score DESC, last_seen_at DESC)
  WHERE status = 'pending' AND held_reason IS NULL;

-- The review surface: what is parked, biggest first.
CREATE INDEX idx_discovery_ledger_held
  ON discovery_ledger (skill_count DESC)
  WHERE held_reason IS NOT NULL;
