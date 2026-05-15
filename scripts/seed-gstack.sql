-- Manually seed garrytan/gstack: 42 skills
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'autoplan', 'garrytan', 'gstack',
  'autoplan', 0, 'garrytan/autoplan',
  85829, 12554, 1777367815, 1773264165, 'Auto-review pipeline — reads the full CEO, design, eng, and DX review skills from disk and runs them sequentially with auto-decisions using 6 decision principles. Surfaces taste decisions (close approaches, borderline scope, codex disagreements) at a final approval gate. One command, fully reviewed plan out. Use when asked to "auto review", "autoplan", "run all reviews", "review this plan automatically", or "make the decisions for me". Proactively suggest when the user has a plan file and wants to run the full review gauntlet without answering 15-30 intermediate questions. (gstack) Voice triggers (speech-to-text aliases): "auto plan", "automatic review".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'benchmark-models', 'garrytan', 'gstack',
  'benchmark-models', 0, 'garrytan/benchmark-models',
  85829, 12554, 1777367815, 1773264165, 'Cross-model benchmark for gstack skills. Runs the same prompt through Claude, GPT (via Codex CLI), and Gemini side-by-side — compares latency, tokens, cost, and optionally quality via LLM judge. Answers "which model is actually best for this skill?" with data instead of vibes. Separate from /benchmark, which measures web page performance. Use when: "benchmark models", "compare models", "which model is best for X", "cross-model comparison", "model shootout". (gstack) Voice triggers (speech-to-text aliases): "compare models", "model shootout", "which model is best".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'benchmark', 'garrytan', 'gstack',
  'benchmark', 0, 'garrytan/benchmark',
  85829, 12554, 1777367815, 1773264165, 'Performance regression detection using the browse daemon. Establishes baselines for page load times, Core Web Vitals, and resource sizes. Compares before/after on every PR. Tracks performance trends over time. Use when: "performance", "benchmark", "page speed", "lighthouse", "web vitals", "bundle size", "load time". (gstack) Voice triggers (speech-to-text aliases): "speed test", "check performance".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'browse', 'garrytan', 'gstack',
  'browse', 0, 'garrytan/browse',
  85829, 12554, 1777367815, 1773264165, 'Fast headless browser for QA testing and site dogfooding. Navigate any URL, interact with elements, verify page state, diff before/after actions, take annotated screenshots, check responsive layouts, test forms and uploads, handle dialogs, and assert element states. ~100ms per command. Use when you need to test a feature, verify a deployment, dogfood a user flow, or file a bug with evidence. Use when asked to "open in browser", "test the site", "take a screenshot", or "dogfood this". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'canary', 'garrytan', 'gstack',
  'canary', 0, 'garrytan/canary',
  85829, 12554, 1777367815, 1773264165, 'Post-deploy canary monitoring. Watches the live app for console errors, performance regressions, and page failures using the browse daemon. Takes periodic screenshots, compares against pre-deploy baselines, and alerts on anomalies. Use when: "monitor deploy", "canary", "post-deploy check", "watch production", "verify deploy". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'careful', 'garrytan', 'gstack',
  'careful', 0, 'garrytan/careful',
  85829, 12554, 1777367815, 1773264165, 'Safety guardrails for destructive commands. Warns before rm -rf, DROP TABLE, force-push, git reset --hard, kubectl delete, and similar destructive operations. User can override each warning. Use when touching prod, debugging live systems, or working in a shared environment. Use when asked to "be careful", "safety mode", "prod mode", or "careful mode". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'codex', 'garrytan', 'gstack',
  'codex', 0, 'garrytan/codex',
  85829, 12554, 1777367815, 1773264165, 'OpenAI Codex CLI wrapper — three modes. Code review: independent diff review via codex review with pass/fail gate. Challenge: adversarial mode that tries to break your code. Consult: ask codex anything with session continuity for follow-ups. The "200 IQ autistic developer" second opinion. Use when asked to "codex review", "codex challenge", "ask codex", "second opinion", or "consult codex". (gstack) Voice triggers (speech-to-text aliases): "code x", "code ex", "get another opinion".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'context-restore', 'garrytan', 'gstack',
  'context-restore', 0, 'garrytan/context-restore',
  85829, 12554, 1777367815, 1773264165, 'Restore working context saved earlier by /context-save. Loads the most recent saved state (across all branches by default) so you can pick up where you left off — even across Conductor workspace handoffs. Use when asked to "resume", "restore context", "where was I", or "pick up where I left off". Pair with /context-save. Formerly /checkpoint resume — renamed because Claude Code treats /checkpoint as a native rewind alias in current environments. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'context-save', 'garrytan', 'gstack',
  'context-save', 0, 'garrytan/context-save',
  85829, 12554, 1777367815, 1773264165, 'Save working context. Captures git state, decisions made, and remaining work so any future session can pick up without losing a beat. Use when asked to "save progress", "save state", "context save", or "save my work". Pair with /context-restore to resume later. Formerly /checkpoint — renamed because Claude Code treats /checkpoint as a native rewind alias in current environments, which was shadowing this skill. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'cso', 'garrytan', 'gstack',
  'cso', 0, 'garrytan/cso',
  85829, 12554, 1777367815, 1773264165, 'Chief Security Officer mode. Infrastructure-first security audit: secrets archaeology, dependency supply chain, CI/CD pipeline security, LLM/AI security, skill supply chain scanning, plus OWASP Top 10, STRIDE threat modeling, and active verification. Two modes: daily (zero-noise, 8/10 confidence gate) and comprehensive (monthly deep scan, 2/10 bar). Trend tracking across audit runs. Use when: "security audit", "threat model", "pentest review", "OWASP", "CSO review". (gstack) Voice triggers (speech-to-text aliases): "see-so", "see so", "security review", "security check", "vulnerability scan", "run security".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'design-consultation', 'garrytan', 'gstack',
  'design-consultation', 0, 'garrytan/design-consultation',
  85829, 12554, 1777367815, 1773264165, 'Design consultation: understands your product, researches the landscape, proposes a complete design system (aesthetic, typography, color, layout, spacing, motion), and generates font+color preview pages. Creates DESIGN.md as your project''s design source of truth. For existing sites, use /plan-design-review to infer the system instead. Use when asked to "design system", "brand guidelines", or "create DESIGN.md". Proactively suggest when starting a new project''s UI with no existing design system or DESIGN.md. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'design-html', 'garrytan', 'gstack',
  'design-html', 0, 'garrytan/design-html',
  85829, 12554, 1777367815, 1773264165, 'Design finalization: generates production-quality Pretext-native HTML/CSS. Works with approved mockups from /design-shotgun, CEO plans from /plan-ceo-review, design review context from /plan-design-review, or from scratch with a user description. Text actually reflows, heights are computed, layouts are dynamic. 30KB overhead, zero deps. Smart API routing: picks the right Pretext patterns for each design type. Use when: "finalize this design", "turn this into HTML", "build me a page", "implement this design", or after any planning skill. Proactively suggest when user has approved a design or has a plan ready. (gstack) Voice triggers (speech-to-text aliases): "build the design", "code the mockup", "make it real".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'design-review', 'garrytan', 'gstack',
  'design-review', 0, 'garrytan/design-review',
  85829, 12554, 1777367815, 1773264165, 'Designer''s eye QA: finds visual inconsistency, spacing issues, hierarchy problems, AI slop patterns, and slow interactions — then fixes them. Iteratively fixes issues in source code, committing each fix atomically and re-verifying with before/after screenshots. For plan-mode design review (before implementation), use /plan-design-review. Use when asked to "audit the design", "visual QA", "check if it looks good", or "design polish". Proactively suggest when the user mentions visual inconsistencies or wants to polish the look of a live site. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'design-shotgun', 'garrytan', 'gstack',
  'design-shotgun', 0, 'garrytan/design-shotgun',
  85829, 12554, 1777367815, 1773264165, 'Design shotgun: generate multiple AI design variants, open a comparison board, collect structured feedback, and iterate. Standalone design exploration you can run anytime. Use when: "explore designs", "show me options", "design variants", "visual brainstorm", or "I don''t like how this looks". Proactively suggest when the user describes a UI feature but hasn''t seen what it could look like. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'devex-review', 'garrytan', 'gstack',
  'devex-review', 0, 'garrytan/devex-review',
  85829, 12554, 1777367815, 1773264165, 'Live developer experience audit. Uses the browse tool to actually TEST the developer experience: navigates docs, tries the getting started flow, times TTHW, screenshots error messages, evaluates CLI help text. Produces a DX scorecard with evidence. Compares against /plan-devex-review scores if they exist (the boomerang: plan said 3 minutes, reality says 8). Use when asked to "test the DX", "DX audit", "developer experience test", or "try the onboarding". Proactively suggest after shipping a developer-facing feature. (gstack) Voice triggers (speech-to-text aliases): "dx audit", "test the developer experience", "try the onboarding", "developer experience test".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'document-release', 'garrytan', 'gstack',
  'document-release', 0, 'garrytan/document-release',
  85829, 12554, 1777367815, 1773264165, 'Post-ship documentation update. Reads all project docs, cross-references the diff, updates README/ARCHITECTURE/CONTRIBUTING/CLAUDE.md to match what shipped, polishes CHANGELOG voice, cleans up TODOS, and optionally bumps VERSION. Use when asked to "update the docs", "sync documentation", or "post-ship docs". Proactively suggest after a PR is merged or code is shipped. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'freeze', 'garrytan', 'gstack',
  'freeze', 0, 'garrytan/freeze',
  85829, 12554, 1777367815, 1773264165, 'Restrict file edits to a specific directory for the session. Blocks Edit and Write outside the allowed path. Use when debugging to prevent accidentally "fixing" unrelated code, or when you want to scope changes to one module. Use when asked to "freeze", "restrict edits", "only edit this folder", or "lock down edits". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'gstack-upgrade', 'garrytan', 'gstack',
  'gstack-upgrade', 0, 'garrytan/gstack-upgrade',
  85829, 12554, 1777367815, 1773264165, 'Upgrade gstack to the latest version. Detects global vs vendored install, runs the upgrade, and shows what''s new. Use when asked to "upgrade gstack", "update gstack", or "get latest version". Voice triggers (speech-to-text aliases): "upgrade the tools", "update the tools", "gee stack upgrade", "g stack upgrade".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'guard', 'garrytan', 'gstack',
  'guard', 0, 'garrytan/guard',
  85829, 12554, 1777367815, 1773264165, 'Full safety mode: destructive command warnings + directory-scoped edits. Combines /careful (warns before rm -rf, DROP TABLE, force-push, etc.) with /freeze (blocks edits outside a specified directory). Use for maximum safety when touching prod or debugging live systems. Use when asked to "guard mode", "full safety", "lock it down", or "maximum safety". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'health', 'garrytan', 'gstack',
  'health', 0, 'garrytan/health',
  85829, 12554, 1777367815, 1773264165, 'Code quality dashboard. Wraps existing project tools (type checker, linter, test runner, dead code detector, shell linter), computes a weighted composite 0-10 score, and tracks trends over time. Use when: "health check", "code quality", "how healthy is the codebase", "run all checks", "quality score". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'investigate', 'garrytan', 'gstack',
  'investigate', 0, 'garrytan/investigate',
  85829, 12554, 1777367815, 1773264165, 'Systematic debugging with root cause investigation. Four phases: investigate, analyze, hypothesize, implement. Iron Law: no fixes without root cause. Use when asked to "debug this", "fix this bug", "why is this broken", "investigate this error", or "root cause analysis". Proactively invoke this skill (do NOT debug directly) when the user reports errors, 500 errors, stack traces, unexpected behavior, "it was working yesterday", or is troubleshooting why something stopped working. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'land-and-deploy', 'garrytan', 'gstack',
  'land-and-deploy', 0, 'garrytan/land-and-deploy',
  85829, 12554, 1777367815, 1773264165, 'Land and deploy workflow. Merges the PR, waits for CI and deploy, verifies production health via canary checks. Takes over after /ship creates the PR. Use when: "merge", "land", "deploy", "merge and verify", "land it", "ship it to production". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'landing-report', 'garrytan', 'gstack',
  'landing-report', 0, 'garrytan/landing-report',
  85829, 12554, 1777367815, 1773264165, 'Read-only queue dashboard for workspace-aware ship. Shows which VERSION slots are currently claimed by open PRs, which sibling Conductor workspaces have WIP work likely to ship soon, and what slot /ship would pick next. No mutations — just a snapshot. Use when asked to "landing report", "what''s in the queue", "show me open PRs", or "which version do I claim next". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'learn', 'garrytan', 'gstack',
  'learn', 0, 'garrytan/learn',
  85829, 12554, 1777367815, 1773264165, 'Manage project learnings. Review, search, prune, and export what gstack has learned across sessions. Use when asked to "what have we learned", "show learnings", "prune stale learnings", or "export learnings". Proactively suggest when the user asks about past patterns or wonders "didn''t we fix this before?"', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'make-pdf', 'garrytan', 'gstack',
  'make-pdf', 0, 'garrytan/make-pdf',
  85829, 12554, 1777367815, 1773264165, 'Turn any markdown file into a publication-quality PDF. Proper 1in margins, intelligent page breaks, page numbers, cover pages, running headers, curly quotes and em dashes, clickable TOC, diagonal DRAFT watermark. Not a draft artifact — a finished artifact. Use when asked to "make a PDF", "export to PDF", "turn this markdown into a PDF", or "generate a document". (gstack) Voice triggers (speech-to-text aliases): "make this a pdf", "make it a pdf", "export to pdf", "turn this into a pdf", "turn this markdown into a pdf", "generate a pdf", "make a pdf from", "pdf this markdown".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'office-hours', 'garrytan', 'gstack',
  'office-hours', 0, 'garrytan/office-hours',
  85829, 12554, 1777367815, 1773264165, 'YC Office Hours — two modes. Startup mode: six forcing questions that expose demand reality, status quo, desperate specificity, narrowest wedge, observation, and future-fit. Builder mode: design thinking brainstorming for side projects, hackathons, learning, and open source. Saves a design doc. Use when asked to "brainstorm this", "I have an idea", "help me think through this", "office hours", or "is this worth building". Proactively invoke this skill (do NOT answer directly) when the user describes a new product idea, asks whether something is worth building, wants to think through design decisions for something that doesn''t exist yet, or is exploring a concept before any code is written. Use before /plan-ceo-review or /plan-eng-review. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'open-gstack-browser', 'garrytan', 'gstack',
  'open-gstack-browser', 0, 'garrytan/open-gstack-browser',
  85829, 12554, 1777367815, 1773264165, 'Launch GStack Browser — AI-controlled Chromium with the sidebar extension baked in. Opens a visible browser window where you can watch every action in real time. The sidebar shows a live activity feed and chat. Anti-bot stealth built in. Use when asked to "open gstack browser", "launch browser", "connect chrome", "open chrome", "real browser", "launch chrome", "side panel", or "control my browser". Voice triggers (speech-to-text aliases): "show me the browser".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'pair-agent', 'garrytan', 'gstack',
  'pair-agent', 0, 'garrytan/pair-agent',
  85829, 12554, 1777367815, 1773264165, 'Pair a remote AI agent with your browser. One command generates a setup key and prints instructions the other agent can follow to connect. Works with OpenClaw, Hermes, Codex, Cursor, or any agent that can make HTTP requests. The remote agent gets its own tab with scoped access (read+write by default, admin on request). Use when asked to "pair agent", "connect agent", "share browser", "remote browser", "let another agent use my browser", or "give browser access". (gstack) Voice triggers (speech-to-text aliases): "pair agent", "connect agent", "share my browser", "remote browser access".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'plan-ceo-review', 'garrytan', 'gstack',
  'plan-ceo-review', 0, 'garrytan/plan-ceo-review',
  85829, 12554, 1777367815, 1773264165, 'CEO/founder-mode plan review. Rethink the problem, find the 10-star product, challenge premises, expand scope when it creates a better product. Four modes: SCOPE EXPANSION (dream big), SELECTIVE EXPANSION (hold scope + cherry-pick expansions), HOLD SCOPE (maximum rigor), SCOPE REDUCTION (strip to essentials). Use when asked to "think bigger", "expand scope", "strategy review", "rethink this", or "is this ambitious enough". Proactively suggest when the user is questioning scope or ambition of a plan, or when the plan feels like it could be thinking bigger. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'plan-design-review', 'garrytan', 'gstack',
  'plan-design-review', 0, 'garrytan/plan-design-review',
  85829, 12554, 1777367815, 1773264165, 'Designer''s eye plan review — interactive, like CEO and Eng review. Rates each design dimension 0-10, explains what would make it a 10, then fixes the plan to get there. Works in plan mode. For live site visual audits, use /design-review. Use when asked to "review the design plan" or "design critique". Proactively suggest when the user has a plan with UI/UX components that should be reviewed before implementation. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'plan-devex-review', 'garrytan', 'gstack',
  'plan-devex-review', 0, 'garrytan/plan-devex-review',
  85829, 12554, 1777367815, 1773264165, 'Interactive developer experience plan review. Explores developer personas, benchmarks against competitors, designs magical moments, and traces friction points before scoring. Three modes: DX EXPANSION (competitive advantage), DX POLISH (bulletproof every touchpoint), DX TRIAGE (critical gaps only). Use when asked to "DX review", "developer experience audit", "devex review", or "API design review". Proactively suggest when the user has a plan for developer-facing products (APIs, CLIs, SDKs, libraries, platforms, docs). (gstack) Voice triggers (speech-to-text aliases): "dx review", "developer experience review", "devex review", "devex audit", "API design review", "onboarding review".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'plan-eng-review', 'garrytan', 'gstack',
  'plan-eng-review', 0, 'garrytan/plan-eng-review',
  85829, 12554, 1777367815, 1773264165, 'Eng manager-mode plan review. Lock in the execution plan — architecture, data flow, diagrams, edge cases, test coverage, performance. Walks through issues interactively with opinionated recommendations. Use when asked to "review the architecture", "engineering review", or "lock in the plan". Proactively suggest when the user has a plan or design doc and is about to start coding — to catch architecture issues before implementation. (gstack) Voice triggers (speech-to-text aliases): "tech review", "technical review", "plan engineering review".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'plan-tune', 'garrytan', 'gstack',
  'plan-tune', 0, 'garrytan/plan-tune',
  85829, 12554, 1777367815, 1773264165, 'Self-tuning question sensitivity + developer psychographic for gstack (v1: observational). Review which AskUserQuestion prompts fire across gstack skills, set per-question preferences (never-ask / always-ask / ask-only-for-one-way), inspect the dual-track profile (what you declared vs what your behavior suggests), and enable/disable question tuning. Conversational interface — no CLI syntax required. Use when asked to "tune questions", "stop asking me that", "too many questions", "show my profile", "what questions have I been asked", "show my vibe", "developer profile", or "turn off question tuning". (gstack) Proactively suggest when the user says the same gstack question has come up before, or when they explicitly override a recommendation for the Nth time.', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'qa-only', 'garrytan', 'gstack',
  'qa-only', 0, 'garrytan/qa-only',
  85829, 12554, 1777367815, 1773264165, 'Report-only QA testing. Systematically tests a web application and produces a structured report with health score, screenshots, and repro steps — but never fixes anything. Use when asked to "just report bugs", "qa report only", or "test but don''t fix". For the full test-fix-verify loop, use /qa instead. Proactively suggest when the user wants a bug report without any code changes. (gstack) Voice triggers (speech-to-text aliases): "bug report", "just check for bugs".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'qa', 'garrytan', 'gstack',
  'qa', 0, 'garrytan/qa',
  85829, 12554, 1777367815, 1773264165, 'Systematically QA test a web application and fix bugs found. Runs QA testing, then iteratively fixes bugs in source code, committing each fix atomically and re-verifying. Use when asked to "qa", "QA", "test this site", "find bugs", "test and fix", or "fix what''s broken". Proactively suggest when the user says a feature is ready for testing or asks "does this work?". Three tiers: Quick (critical/high only), Standard (+ medium), Exhaustive (+ cosmetic). Produces before/after health scores, fix evidence, and a ship-readiness summary. For report-only mode, use /qa-only. (gstack) Voice triggers (speech-to-text aliases): "quality check", "test the app", "run QA".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'retro', 'garrytan', 'gstack',
  'retro', 0, 'garrytan/retro',
  85829, 12554, 1777367815, 1773264165, 'Weekly engineering retrospective. Analyzes commit history, work patterns, and code quality metrics with persistent history and trend tracking. Team-aware: breaks down per-person contributions with praise and growth areas. Use when asked to "weekly retro", "what did we ship", or "engineering retrospective". Proactively suggest at the end of a work week or sprint. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'review', 'garrytan', 'gstack',
  'review', 0, 'garrytan/review',
  85829, 12554, 1777367815, 1773264165, 'Pre-landing PR review. Analyzes diff against the base branch for SQL safety, LLM trust boundary violations, conditional side effects, and other structural issues. Use when asked to "review this PR", "code review", "pre-landing review", or "check my diff". Proactively suggest when the user is about to merge or land code changes. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'setup-browser-cookies', 'garrytan', 'gstack',
  'setup-browser-cookies', 0, 'garrytan/setup-browser-cookies',
  85829, 12554, 1777367815, 1773264165, 'Import cookies from your real Chromium browser into the headless browse session. Opens an interactive picker UI where you select which cookie domains to import. Use before QA testing authenticated pages. Use when asked to "import cookies", "login to the site", or "authenticate the browser". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'setup-deploy', 'garrytan', 'gstack',
  'setup-deploy', 0, 'garrytan/setup-deploy',
  85829, 12554, 1777367815, 1773264165, 'Configure deployment settings for /land-and-deploy. Detects your deploy platform (Fly.io, Render, Vercel, Netlify, Heroku, GitHub Actions, custom), production URL, health check endpoints, and deploy status commands. Writes the configuration to CLAUDE.md so all future deploys are automatic. Use when: "setup deploy", "configure deployment", "set up land-and-deploy", "how do I deploy with gstack", "add deploy config".', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'setup-gbrain', 'garrytan', 'gstack',
  'setup-gbrain', 0, 'garrytan/setup-gbrain',
  85829, 12554, 1777367815, 1773264165, 'Set up gbrain for this coding agent: install the CLI, initialize a local PGLite or Supabase brain, register MCP, capture per-remote trust policy. One command from zero to "gbrain is running, and this agent can call it." Use when: "setup gbrain", "connect gbrain", "start gbrain", "install gbrain", "configure gbrain for this machine". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'ship', 'garrytan', 'gstack',
  'ship', 0, 'garrytan/ship',
  85829, 12554, 1777367815, 1773264165, 'Ship workflow: detect + merge base branch, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR. Use when asked to "ship", "deploy", "push to main", "create a PR", "merge and push", or "get it deployed". Proactively invoke this skill (do NOT push/PR directly) when the user says code is ready, asks about deploying, wants to push code up, or asks to create a PR. (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
INSERT INTO skills (
  name, owner, repo, display_name, installs, slug,
  stars, forks, pushed_at, repo_created_at, description, default_branch,
  repo_meta_synced_at, broken_since,
  current_sha, modified_at, first_seen_at, references_count,
  last_synced_at, sync_status, last_tree_sha
) VALUES (
  'unfreeze', 'garrytan', 'gstack',
  'unfreeze', 0, 'garrytan/unfreeze',
  85829, 12554, 1777367815, 1773264165, 'Clear the freeze boundary set by /freeze, allowing edits to all directories again. Use when you want to widen edit scope without ending the session. Use when asked to "unfreeze", "unlock edits", "remove freeze", or "allow all edits". (gstack)', 'main',
  1777386746, NULL,
  NULL, 1777367815, 1777386746, 0,
  1777386746, 'manual-seed', NULL
)
ON CONFLICT(owner, repo, name) DO UPDATE SET
  display_name = excluded.display_name,
  description  = COALESCE(excluded.description, skills.description),
  stars        = excluded.stars,
  forks        = excluded.forks,
  pushed_at    = excluded.pushed_at,
  repo_meta_synced_at = excluded.repo_meta_synced_at;
