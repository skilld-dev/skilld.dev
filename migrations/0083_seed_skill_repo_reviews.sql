-- A deliberately narrow cohort of individual GitHub creators. Each repository
-- primarily publishes reusable, generally applicable agent skills.
UPDATE skill_repo_eligibility
SET
  reason = 'Individual creator repository publishing reusable development and product workflow skills.',
  reviewed_at = unixepoch()
WHERE owner = 'harlan-zw'
  AND repo = 'harlan-agent-kit'
  AND status = 'eligible'
  AND reviewed_by = 'harlan';

INSERT OR IGNORE INTO skill_repo_eligibility (
  owner,
  repo,
  status,
  reason,
  reviewed_by,
  reviewed_at
) VALUES
  ('obra', 'superpowers', 'eligible', 'Individual creator repository publishing reusable software development workflow skills.', 'harlan', unixepoch()),
  ('mattpocock', 'skills', 'eligible', 'Individual creator repository publishing reusable software engineering guidance skills.', 'harlan', unixepoch()),
  ('garrytan', 'gstack', 'eligible', 'Individual creator repository publishing reusable end-to-end software development skills.', 'harlan', unixepoch()),
  ('addyosmani', 'agent-skills', 'eligible', 'Individual creator repository publishing reusable web engineering and quality skills.', 'harlan', unixepoch()),
  ('pbakaus', 'impeccable', 'eligible', 'Individual creator repository publishing reusable frontend design and review skills.', 'harlan', unixepoch()),
  ('coreyhaines31', 'marketingskills', 'eligible', 'Individual creator repository publishing reusable marketing strategy and execution skills.', 'harlan', unixepoch()),
  ('wshobson', 'agents', 'eligible', 'Individual creator repository publishing a broad collection of reusable engineering skills.', 'harlan', unixepoch()),
  ('jimliu', 'baoyu-skills', 'eligible', 'Individual creator repository publishing reusable writing, media, and publishing skills.', 'harlan', unixepoch()),
  ('emilkowalski', 'skills', 'eligible', 'Individual creator repository publishing reusable interface and interaction design skills.', 'harlan', unixepoch()),
  ('jeffallan', 'claude-skills', 'eligible', 'Individual creator repository publishing a broad collection of reusable software engineering skills.', 'harlan', unixepoch()),
  ('ibelick', 'ui-skills', 'eligible', 'Individual creator repository publishing reusable interface design and review skills.', 'harlan', unixepoch()),
  ('antfu', 'skills', 'eligible', 'Individual creator repository publishing reusable web development workflow skills.', 'harlan', unixepoch()),
  ('intellectronica', 'agent-skills', 'eligible', 'Individual creator repository publishing reusable research and software workflow skills.', 'harlan', unixepoch()),
  ('harlan-zw', 'harlan-agent-kit', 'eligible', 'Individual creator repository publishing reusable development and product workflow skills.', 'harlan', unixepoch());
