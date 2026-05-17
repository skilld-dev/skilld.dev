-- Tracks the SKILL.md SHA that ai-generate-poll last fully completed for
-- a skill (summary + tags + faq batch results all written). ai-generate-submit
-- uses this as a cheap short-circuit before falling back to the per-kind
-- NOT EXISTS scan in skill_generated, so steady-state weeks where nothing
-- changed don't burn Anthropic batch quota.
ALTER TABLE skills ADD COLUMN ai_generated_sha TEXT;
CREATE INDEX IF NOT EXISTS idx_skills_ai_gen_sha ON skills (ai_generated_sha);
