-- SEO experiment (2026-09-30, gate 2026-11-11): a Skill page is indexable only
-- if it has appeared on a trending board. This table is the admitted set.
--
-- Additive on purpose. Trending boards change every week, and a page that
-- flips between index and noindex confuses Google. A row stays until the gate.
-- Cull path: `DELETE FROM skill_trending_admissions;` then remove the
-- admission condition in `trending-admission.ts` to restore the old rule.
CREATE TABLE IF NOT EXISTS skill_trending_admissions (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Unix seconds of the first sighting on any board.
  admitted_at INTEGER NOT NULL,
  -- The board that first admitted it: 'week', 'month' or 'all'. 'probe' marks
  -- a named exception for experiment D, indexable whatever its quality score.
  first_board TEXT NOT NULL CHECK (first_board IN ('week', 'month', 'all', 'probe')),
  PRIMARY KEY (owner, repo, name)
) WITHOUT ROWID;

-- Seed, 2026-09-30: today's admitted set, so the experiment never starts empty.
-- The snapshot is the Skills on the week, month and all boards that passed the
-- quality score (65 of 95), read from production. `first_board` is 'month' for all
-- of them because the snapshot did not keep the board. `harlan-zw/gscdump` is the
-- experiment D probe exception. The hourly task adds the rest.
INSERT OR IGNORE INTO skill_trending_admissions (owner, repo, name, admitted_at, first_board) VALUES
  ('addyosmani', 'web-quality-skills', 'accessibility', unixepoch(), 'month'),
  ('agricidaniel', 'claude-ads', 'ads', unixepoch(), 'month'),
  ('agricidaniel', 'claude-seo', 'seo', unixepoch(), 'month'),
  ('antfu', 'skills', 'nitro', unixepoch(), 'month'),
  ('avdlee', 'swift-concurrency-agent-skill', 'swift-concurrency', unixepoch(), 'month'),
  ('avdlee', 'swiftui-agent-skill', 'swiftui-expert-skill', unixepoch(), 'month'),
  ('axtonliu', 'axton-obsidian-visual-skills', 'excalidraw-diagram', unixepoch(), 'month'),
  ('blader', 'humanizer', 'humanizer', unixepoch(), 'month'),
  ('browser-use', 'plugins', 'browser-use', unixepoch(), 'month'),
  ('cathrynlavery', 'diagram-design', 'diagram-design', unixepoch(), 'month'),
  ('clerk', 'skills', 'clerk-orgs', unixepoch(), 'month'),
  ('cloudai-x', 'threejs-skills', 'threejs-animation', unixepoch(), 'month'),
  ('conorluddy', 'ios-simulator-skill', 'ios-simulator-skill', unixepoch(), 'month'),
  ('coreyhaines31', 'marketingskills', 'ai-seo', unixepoch(), 'month'),
  ('czlonkowski', 'n8n-skills', 'n8n-code-python', unixepoch(), 'month'),
  ('deanpeters', 'product-manager-skills', 'competitive-analysis-process', unixepoch(), 'month'),
  ('dexhunter', 'seedance2-skill', 'seedance2-skill', unixepoch(), 'month'),
  ('dimillian', 'skills', 'bug-hunt-swarm', unixepoch(), 'month'),
  ('dpearson2699', 'swift-ios-skills', 'swift-concurrency', unixepoch(), 'month'),
  ('emilkowalski', 'skills', 'animate', unixepoch(), 'month'),
  ('emilkowalski', 'skills', 'emil-design-eng', unixepoch(), 'month'),
  ('emilkowalski', 'skills', 'review-animations', unixepoch(), 'month'),
  ('ferdinandobons', 'startup-skill', 'startup-pitch', unixepoch(), 'month'),
  ('garrytan', 'gstack', 'autoplan', unixepoch(), 'month'),
  ('geekjourneyx', 'md2wechat-skill', 'md2wechat', unixepoch(), 'month'),
  ('getsentry', 'skills', 'prompt-optimizer', unixepoch(), 'month'),
  ('hugohe3', 'ppt-master', 'ppt-master', unixepoch(), 'month'),
  ('humanlayer', 'skills', 'show-me', unixepoch(), 'month'),
  ('ibelick', 'ui-skills', 'create-design-md', unixepoch(), 'month'),
  ('imbad0202', 'academic-research-skills', 'academic-pipeline', unixepoch(), 'month'),
  ('jakubkrehel', 'make-interfaces-feel-better', 'make-interfaces-feel-better', unixepoch(), 'month'),
  ('jimliu', 'baoyu-skills', 'baoyu-image-gen', unixepoch(), 'month'),
  ('kepano', 'obsidian-skills', 'knap', unixepoch(), 'month'),
  ('lackeyjb', 'playwright-skill', 'playwright-skill', unixepoch(), 'month'),
  ('leonxlnx', 'taste-skill', 'stitch-skill', unixepoch(), 'month'),
  ('leonxlnx', 'taste-skill', 'taste-skill', unixepoch(), 'month'),
  ('leonxlnx', 'unlazy', 'unlazy', unixepoch(), 'month'),
  ('lijigang', 'ljg-skills', 'ljg-map', unixepoch(), 'month'),
  ('lingfengqaq', 'webnovel-writer', 'webnovel-init', unixepoch(), 'month'),
  ('ljagiello', 'ctf-skills', 'ctf-crypto', unixepoch(), 'month'),
  ('mattpocock', 'skills', 'ask-matt', unixepoch(), 'month'),
  ('michaelshimeles', 'skills', 'unslop', unixepoch(), 'month'),
  ('microsoft', 'playwright-cli', 'playwright-cli', unixepoch(), 'month'),
  ('muratcankoylan', 'agent-skills-for-context-engineering', 'long-horizon-prompting', unixepoch(), 'month'),
  ('mvanhorn', 'last30days-skill', 'last30days', unixepoch(), 'month'),
  ('neondatabase', 'agent-skills', 'neon-postgres', unixepoch(), 'month'),
  ('nicobailon', 'visual-explainer', 'visual-explainer', unixepoch(), 'month'),
  ('obra', 'superpowers', 'writing-plans', unixepoch(), 'month'),
  ('othmanadi', 'planning-with-files', 'planning-with-files', unixepoch(), 'month'),
  ('paramchoudhary', 'resumeskills', 'application-form-filler', unixepoch(), 'month'),
  ('parthjadhav', 'app-store-screenshots', 'app-store-screenshots', unixepoch(), 'month'),
  ('pbakaus', 'impeccable', 'impeccable', unixepoch(), 'month'),
  ('petergyang', 'no-ai-slop', 'no-ai-slop', unixepoch(), 'month'),
  ('prisma', 'skills', 'prisma-database-setup', unixepoch(), 'month'),
  ('remotion-dev', 'skills', 'remotion-best-practices', unixepoch(), 'month'),
  ('sanyuan0704', 'sanyuan-skills', 'skill-review', unixepoch(), 'month'),
  ('shadcn', 'ui', 'shadcn', unixepoch(), 'month'),
  ('shanraisshan', 'claude-code-best-practice', 'weather-fetcher', unixepoch(), 'month'),
  ('tradermonty', 'claude-trading-skills', 'trade-performance-coach', unixepoch(), 'month'),
  ('tt-a1i', 'archify', 'archify', unixepoch(), 'month'),
  ('twostraws', 'swiftui-agent-skill', 'swiftui-pro', unixepoch(), 'month'),
  ('vercel-labs', 'agent-skills', 'react-best-practices', unixepoch(), 'month'),
  ('vercel-labs', 'skills', 'find-skills', unixepoch(), 'month'),
  ('zarazhangrui', 'frontend-slides', 'frontend-slides', unixepoch(), 'month'),
  ('zubair-trabzada', 'geo-seo-claude', 'geo', unixepoch(), 'month'),
  ('harlan-zw', 'gscdump', 'gscdump', unixepoch(), 'probe');
