-- Editorial expansion of the repository leaderboard.
--
-- Every eligible row below was checked against GitHub on 2026-07-28:
--   * canonical owner resolves to an individual User;
--   * repository purpose primarily distributes reusable agent skills;
--   * the discovered SKILL.md inventory is generic and reusable outside one project.
--
-- Trust-gated inventories are reconsidered only after this explicit review.

CREATE TABLE leaderboard_review_0084 (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  PRIMARY KEY (owner, repo)
);

CREATE TABLE skill_repo_review_sync_outbox (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  PRIMARY KEY (owner, repo)
);

INSERT INTO leaderboard_review_0084 (owner, repo) VALUES
  ('kepano', 'obsidian-skills'),
  ('zarazhangrui', 'frontend-slides'),
  ('othmanadi', 'planning-with-files'),
  ('agricidaniel', 'claude-seo'),
  ('lijigang', 'ljg-skills'),
  ('deanpeters', 'product-manager-skills'),
  ('czlonkowski', 'n8n-skills'),
  ('twostraws', 'swiftui-agent-skill'),
  ('dimillian', 'skills'),
  ('geekjourneyx', 'md2wechat-skill'),
  ('avdlee', 'swiftui-agent-skill'),
  ('axtonliu', 'axton-obsidian-visual-skills'),
  ('lackeyjb', 'playwright-skill'),
  ('ljagiello', 'ctf-skills'),
  ('cloudai-x', 'threejs-skills'),
  ('addyosmani', 'web-quality-skills'),
  ('tradermonty', 'claude-trading-skills'),
  ('avdlee', 'swift-concurrency-agent-skill'),
  ('conorluddy', 'ios-simulator-skill'),
  ('adithya-s-k', 'manim_skill'),
  ('am-will', 'codex-skills'),
  ('dpearson2699', 'swift-ios-skills'),
  ('rookie-ricardo', 'erduo-skills'),
  ('tfriedel', 'claude-office-skills'),
  ('onmax', 'nuxt-skills'),
  ('ramziddin', 'solid-skills'),
  ('aj-geddes', 'claude-code-bmad-skills'),
  ('avdlee', 'swift-testing-agent-skill'),
  ('ailabs-393', 'ai-labs-claude-skills'),
  ('boshu2', 'agentops'),
  ('bahayonghang', 'academic-writing-skills'),
  ('waynesutton', 'convexskills'),
  ('iamzhihuix', 'happy-claude-skills'),
  ('hoodini', 'ai-agents-skills'),
  ('johnrogers', 'claude-swift-engineering'),
  ('msmps', 'opentui-skill'),
  ('pbakaus', 'agent-reviews'),
  ('iamzifei', 'wechat-article-publisher-skill'),
  ('sugarforever', '01coder-agent-skills'),
  ('jwynia', 'agent-skills'),
  ('daleseo', 'korean-skills'),
  ('benjaminsehl', 'liquid-skills'),
  ('wsimmonds', 'claude-nextjs-skills'),
  ('enzed', 'r3f-skills'),
  ('madteacher', 'mad-agents-skills'),
  ('boristane', 'agent-skills'),
  ('breath57', 'dingtalk-skills'),
  ('sergiodxa', 'agent-skills'),
  ('philschmid', 'self-learning-skill'),
  ('dkyazzentwatwa', 'chatgpt-skills'),
  ('dylantarre', 'animation-principles'),
  ('ccheney', 'robust-skills'),
  ('patricio0312rev', 'skills'),
  ('raphaelsalaja', 'skill'),
  ('acedergren', 'agentic-tools'),
  ('aktsmm', 'agent-skills'),
  ('roin-orca', 'skills'),
  ('nodnarbnitram', 'claude-code-extensions'),
  ('giulioco', 'skills'),
  ('ctsstc', 'get-shit-done-skills'),
  ('geoffjay', 'claude-plugins'),
  ('hieutrtr', 'ai1-skills'),
  ('zaddy6', 'agent-email-skill'),
  ('ejirocodes', 'agent-skills'),
  ('veithly', 'tavily-search'),
  ('adjfks', 'corner-skills'),
  ('grasseed', 'google-search-browser-use'),
  ('softbread', 'xiaohongshu-doctor'),
  ('leonxlnx', 'taste-skill'),
  ('shanraisshan', 'claude-code-best-practice'),
  ('mvanhorn', 'last30days-skill'),
  ('hugohe3', 'ppt-master'),
  ('imbad0202', 'academic-research-skills'),
  ('muratcankoylan', 'agent-skills-for-context-engineering'),
  ('nicobailon', 'visual-explainer'),
  ('zubair-trabzada', 'geo-seo-claude'),
  ('agricidaniel', 'claude-ads'),
  ('lingfengqaq', 'webnovel-writer'),
  ('parthjadhav', 'app-store-screenshots'),
  ('sanyuan0704', 'sanyuan-skills'),
  ('dexhunter', 'seedance2-skill'),
  ('paramchoudhary', 'resumeskills'),
  ('freshtechbro', 'claudedesignskills'),
  ('ferdinandobons', 'startup-skill'),
  ('rominirani', 'antigravity-skills'),
  ('cat-xierluo', 'legal-skills'),
  ('hanlulong', 'econ-writing-skill'),
  ('cookjohn', 'gs-skills'),
  ('obra', 'the-elements-of-style'),
  ('twostraws', 'swift-testing-agent-skill'),
  ('palkan', 'skills'),
  ('pablo-mano', 'obsidian-cli-skill'),
  ('kingbootoshi', 'nano-banana-2-skill'),
  ('obra', 'superpowers-lab'),
  ('twostraws', 'swiftdata-agent-skill'),
  ('ryanbbrown', 'revealjs-skill'),
  ('cameronfreer', 'lean4-skills'),
  ('ginobefun', 'deep-reading-analyst-skill'),
  ('notedit', 'happy-skills'),
  ('zxkane', 'aws-skills'),
  ('ntcoding', 'claude-skillz'),
  ('arpitg1304', 'robotics-agent-skills'),
  ('nimrodfisher', 'data-analytics-skills'),
  ('wshuyi', 'deep-research'),
  ('agamm', 'claude-code-owasp'),
  ('almogbaku', 'debug-skill'),
  ('elementsix', 'elementsix-skills'),
  ('staskh', 'trading_skills'),
  ('davidfowl', 'dotnet-skillz'),
  ('quodsoler', 'unreal-engine-skills'),
  ('avdlee', 'core-data-agent-skill'),
  ('michaelshimeles', 'skills'),
  ('akin-ozer', 'cc-devops-skills'),
  ('alaliqing', 'claude-paper'),
  ('jtydhr88', 'comfyui-custom-node-skills'),
  ('ognjengt', 'founder-skills'),
  ('austintgriffith', 'ethskills'),
  ('guo-yu', 'skills'),
  ('zhaihao118', 'micro-drama-skills'),
  ('theprimeagen', 'skills'),
  ('am-will', 'swarms'),
  ('lexler', 'skill-factory'),
  ('elvismdev', 'claude-wordpress-skills'),
  ('thvroyal', 'kimi-skills'),
  ('fugazi', 'test-automation-skills-agents'),
  ('deckardger', 'tanstack-agent-skills'),
  ('dean9703111', 'ai-agent-skill-for-video-workflow'),
  ('thomast1906', 'github-copilot-agent-skills'),
  ('ahmedasmar', 'devops-claude-skills'),
  ('apcamargo', 'typst-skills'),
  ('jamesrochabrun', 'skills'),
  ('cathrynlavery', 'codex-skill'),
  ('ab604', 'claude-code-r-skills'),
  ('careerhackeralex', 'visualize'),
  ('marketcalls', 'vectorbt-backtesting-skills'),
  ('bradautomates', 'head-of-content'),
  ('dylanfeltus', 'skills'),
  ('gapmiss', 'obsidian-plugin-skill'),
  ('artwist-polyakov', 'polyakov-claude-skills'),
  ('oopslink', 'trading-skills'),
  ('psiace', 'skills'),
  ('dadederk', 'ios-accessibility-agent-skill'),
  ('georgeguimaraes', 'claude-code-elixir'),
  ('smnandre', 'symfony-ux-skills'),
  ('nakanosanku', 'ohmyskills'),
  ('davidortinau', 'maui-skills'),
  ('joellewis', 'finance_skills'),
  ('severity1', 'claude-code-auto-memory'),
  ('okooo5km', 'skills4u'),
  ('zh-xx', 'legal-assistant-skills'),
  ('smerchek', 'claude-epub-skill'),
  ('wh-2099', 'mermaid-skill'),
  ('ertugrul-dmr', 'clean-code-skills'),
  ('yzlnew', 'infra-skills'),
  ('chongdashu', 'cc-skills-nanobananapro'),
  ('wshuyi', 'research-to-diagram'),
  ('cmb211087', 'azure-diagrams-skill'),
  ('pzep1', 'xcode-build-skill'),
  ('wirasm', 'worktree-manager-skill'),
  ('cxuu', 'golang-skills'),
  ('xenodium', 'emacs-skills'),
  ('notlate-cn', 'code-reader-skills'),
  ('cnemri', 'google-genai-skills'),
  ('st0012', 'ruby-skills'),
  ('satoruhiga', 'claude-touchdesigner'),
  ('danjdewhurst', 'story-skills'),
  ('smixs', 'creative-director-skill'),
  ('liangdabiao', 'market-insight-claude-skill'),
  ('omidzamani', 'dspy-skills'),
  ('unclecatvn', 'agent-skills'),
  ('smixs', 'skill-conductor'),
  ('isjiamu', 'jiamu-skills'),
  ('mgonto', 'executive-assistant-skills'),
  ('huifer', 'claude-code-seo'),
  ('wpgaurav', 'generateblocks-skills'),
  ('ameyalambat128', 'swiftui-skills'),
  ('joeseesun', 'defuddle-skill'),
  ('cookjohn', 'wos-skills'),
  ('zanecole10', 'software-tailor-skills'),
  ('adenaufal', 'anti-slop-writing'),
  ('greatpie', 'smart-contract-audit-skill'),
  ('stevysmith', 'og-image-skill'),
  ('vincentkoc', 'dotskills'),
  ('hayattiq', 'x-research-skills'),
  ('spences10', 'svelte-skills-kit'),
  ('hardw00t', 'ai-security-arsenal'),
  ('buainoai', 'remotion-skills'),
  ('harryworld', 'xcode26-agent-skills'),
  ('wilkomarketing', 'antigravity-n8n-skills'),
  ('dmccreary', 'claude-skills'),
  ('jonathimer', 'devmarketing-skills'),
  ('mjunaidca', 'polymarket-skills'),
  ('pasqualevittoriosi', 'swift-accessibility-skill'),
  ('flysheep-ai', 'education-skills'),
  ('shepsci', 'kaggle-skill'),
  ('codenamev', 'ai-software-architect'),
  ('nealcaren', 'social-data-analysis'),
  ('altenli', 'stock-analyzer-skill'),
  ('grasmash', 'drupal-claude-skills'),
  ('fvadicamo', 'dev-agent-skills'),
  ('wangyafu', 'resume-skills'),
  ('bamzc', 'claude-skills-frontend'),
  ('chadboyda', 'agent-gtm-skills'),
  ('oikon48', 'cc-frontend-skills'),
  ('richtabor', 'agent-skills'),
  ('ronnythedev', 'dotnet-clean-architecture-skills'),
  ('bacoco', 'bmad-skills'),
  ('paulrberg', 'agent-skills'),
  ('wdm0006', 'python-skills'),
  ('shinchven', 'nano-banana-skills'),
  ('alextangson', 'feishu_skills'),
  ('alonw0', 'llm-docs-optimizer'),
  ('arman-kudaibergenov', '1c-ai-development-kit'),
  ('oaustegard', 'claude-skills'),
  ('poemswe', 'co-researcher'),
  ('carson2222', 'skills'),
  ('obie', 'skills'),
  ('snowtema', 'ajtbd-skills'),
  ('alffei', 'skill_share'),
  ('wshaddix', 'dotnet-skills'),
  ('simota', 'agent-skills'),
  ('dianel555', 'dskills'),
  ('rshankras', 'claude-code-apple-skills'),
  ('thedivergentai', 'gd-agentic-skills'),
  ('secondsky', 'sap-skills');

INSERT INTO skill_repo_eligibility (
  owner, repo, status, reason, reviewed_by, reviewed_at
)
SELECT
  owner,
  repo,
  'eligible',
  'Individual creator repository whose reviewed purpose and inventory primarily publish reusable, generic agent skills.',
  'leaderboard-curation-2026-07-28',
  unixepoch()
FROM leaderboard_review_0084
WHERE true
ON CONFLICT(owner, repo) DO UPDATE SET
  status = excluded.status,
  reason = excluded.reason,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;

INSERT INTO repo_trust_overrides (
  owner, repo, tier, source, reason, reviewed_by, reviewed_at
)
SELECT
  owner,
  repo,
  'trusted-curator',
  'leaderboard-review',
  'Repository purpose and skill inventory passed leaderboard editorial review.',
  'leaderboard-curation-2026-07-28',
  unixepoch()
FROM leaderboard_review_0084
WHERE true
ON CONFLICT(owner, repo) DO UPDATE SET
  tier = excluded.tier,
  source = excluded.source,
  reason = excluded.reason,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;

UPDATE discovery_candidates
SET source = 'manual',
    last_discovered_at = MAX(last_discovered_at, unixepoch()),
    last_attempted_at = NULL,
    attempt_count = 0,
    outcome = 'pending',
    rejection_reason = NULL,
    last_error = NULL,
    retry_state = 'ready',
    next_retry_at = NULL,
    reconsideration_count = reconsideration_count + 1,
    claimed_at = NULL,
    claim_token = NULL
WHERE retry_state <> 'claimed'
  AND EXISTS (
    SELECT 1
    FROM leaderboard_review_0084 AS review
    WHERE review.owner = discovery_candidates.owner
      AND review.repo = discovery_candidates.repo
  );

INSERT INTO skill_repo_review_sync_outbox (owner, repo, queued_at)
SELECT review.owner, review.repo, unixepoch()
FROM leaderboard_review_0084 AS review
WHERE EXISTS (
    SELECT 1
    FROM discovery_candidates AS discovery
    WHERE discovery.owner = review.owner
      AND discovery.repo = review.repo
      AND discovery.retry_state = 'ready'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM skills AS skill
    WHERE skill.owner = review.owner
      AND skill.repo = review.repo
  )
ON CONFLICT(owner, repo) DO NOTHING;

DROP TABLE leaderboard_review_0084;
