-- Seed the curated starter collections (2026-08-04 restructure).
-- Idempotent: updates these collection slugs and replaces only their entries.
--
-- Curation rules (VISION.md):
--   - Provenance-first reasons: who wrote it and why they are the authority.
--   - No install counts anywhere (anti-scope 4); stars are the only sanctioned
--     popularity signal and reasons don't need numbers at all.
--   - One collection, one question. The old frontend-ui / frontend-ux /
--     design-stack trio collapsed into frontend-design; the flagship
--     design-engineering-essentials leads the featured set.
--
-- Transition note: the previously featured trio (agent-building-stack,
-- typescript-engineering-stack, agent-workflow-stack) stays live and featured
-- with low featured_at values so the currently deployed homepage keeps
-- rendering until the DB-driven featured endpoint deploys. Run
-- scripts/cleanup-replaced-collections.sql after that deploy.

INSERT OR IGNORE INTO users (
  github_id, login, name, created_at, last_login_at
) VALUES (
  5326365, 'harlan-zw', 'Harlan Wilton',
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER)
);

INSERT INTO collections_v2 (
  author_user_id, slug, name, preamble, featured, featured_at, created_at, updated_at, deleted_at
) VALUES
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'design-engineering-essentials',
  'Design Engineering Essentials',
  'The flagship set for design engineers: interface feel, motion, accessibility, and component quality, plus the testing that proves the work, each skill from the person who owns that craft.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 300,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'essentials',
  'Essentials',
  'Eight cross-stack first installs that work in any agent: plan, verify, debug, test, and a design baseline. Every skill is a context tax; these are the ones that earn it.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 295,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'vue-nuxt',
  'Vue and Nuxt',
  'The Vue and Nuxt agent setup from the official orgs and the people who maintain the ecosystem: canonical best practices, fresh docs skills, and the component layer from the source.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 290,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'codebase-architecture',
  'Codebase Architecture',
  'Plan structural changes with clear domain language, architecture review, tests, debugging, and an executable plan.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 280,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'frontend-design',
  'Frontend Design',
  'Frontend design judgment made concrete: critique, baseline visual quality, accessibility review, motion performance, and the standards production interfaces are held to.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 270,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'react',
  'React',
  'React patterns from the people who maintain the ecosystem: the framework playbook, the component library from its author, the data-fetching layer, and the performance passes that keep a UI honest.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 260,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'web-quality',
  'Web Quality',
  'Addy Osmani''s web quality suite: performance audits, Core Web Vitals, accessibility, SEO, and best practices before you ship.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 250,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'backend-data',
  'Backend and Data',
  'Backend skills for agents wiring up databases, auth, and realtime: Supabase Postgres, Firebase, Convex, and Better Auth, each from the team that builds it.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 240,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'browser-automation',
  'Browser Automation',
  'When an agent needs to drive a browser: scrape pages, click through flows, and pull structured content into the loop.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 230,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'apple-apps',
  'Apple Apps',
  'SwiftUI and Swift concurrency skills for modern iOS and macOS app work, from the people who teach and ship on the platform.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 220,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'knowledge-workspace',
  'Knowledge Workspace',
  'Skills for agents working inside Obsidian vaults, markdown knowledge bases, canvas files, and cleaned-up web content.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 210,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'code-review',
  'Code Review',
  'Turn review comments, bot findings, and production issues into fixed code.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 200,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'agent-workflow',
  'Agent Workflow',
  'Run multi-pass changes with focused delegation, parallel work, verification, and a clean branch handoff.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 195,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlan-zw'),
  'agent-building',
  'Agent Building',
  'Find and install an existing skill, create and validate one when needed, or connect a new tool through MCP.',
  0,
  CAST(strftime('%s','now') AS INTEGER) + 190,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
)
ON CONFLICT(author_user_id, slug) DO UPDATE SET
  name = excluded.name,
  preamble = excluded.preamble,
  featured = excluded.featured,
  featured_at = excluded.featured_at,
  updated_at = excluded.updated_at,
  deleted_at = NULL;

-- Retire the replaced slugs (the transition trio is handled by
-- scripts/cleanup-replaced-collections.sql after the featured endpoint
-- deploys).
UPDATE collections_v2
SET deleted_at = CAST(strftime('%s','now') AS INTEGER),
    featured = 0,
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw')
  AND deleted_at IS NULL
  AND slug IN (
    'frontend-taste-stack',
    'frontend-ui-stack',
    'frontend-ux-stack',
    'design-stack',
    'react-stack',
    'web-quality-stack',
    'vue-nuxt-stack',
    'backend-data-stack',
    'browser-automation-stack',
    'apple-app-stack',
    'knowledge-workspace-stack',
    'pr-review-cleanup-stack'
  );

DELETE FROM collection_skills_v2
WHERE collection_id IN (
  SELECT id
  FROM collections_v2
  WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw')
    AND slug IN (
      'design-engineering-essentials',
      'essentials',
      'vue-nuxt',
      'codebase-architecture',
      'frontend-design',
      'react',
      'web-quality',
      'backend-data',
      'browser-automation',
      'apple-apps',
      'knowledge-workspace',
      'code-review',
      'agent-workflow',
      'agent-building'
    )
);

INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason) VALUES
-- design-engineering-essentials
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 0, 'emilkowalski', 'skills', 'emil-design-eng', 'Emil Kowalski teaches the invisible details: micro-interactions, motion, and component polish that make software feel deliberate.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 1, 'jakubkrehel', 'make-interfaces-feel-better', 'make-interfaces-feel-better', 'Jakub Krehel''s playbook for the small moves that make interfaces feel good: timing, easing, feedback, and the friction worth removing.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 2, 'pbakaus', 'impeccable', 'impeccable', 'Paul Bakaus''s Impeccable runs live-browser design review with deterministic detector rules, aiming at interfaces that pass professional critique.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 3, 'vercel-labs', 'agent-skills', 'web-design-guidelines', 'Rauno Freiberg''s Web Interface Guidelines as a review command: the checklist design engineers already run by hand.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 4, 'ibelick', 'ui-skills', 'fixing-motion-performance', 'Julien Thibeaut''s fixing-motion-performance catches the janky transitions and animations that make even a good design feel cheap.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 5, 'ibelick', 'ui-skills', 'fixing-accessibility', 'Julien Thibeaut''s concrete accessibility pass: keyboard, focus, ARIA, contrast, and form errors, the states agents most often forget.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 6, 'shadcn', 'ui', 'shadcn', 'The shadcn/ui skill from the source: component composition, theming, and the patterns the library was built around.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 7, 'vercel-labs', 'agent-skills', 'react-best-practices', 'Vercel''s own React playbook, maintained by the team that ships the framework''s reference deployments.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 8, 'millionco', 'react-doctor', 'react-doctor', 'Million''s React Doctor diagnoses render cost, wasted re-renders, and the performance issues that quietly degrade a UI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'design-engineering-essentials'), 9, 'microsoft', 'playwright-cli', 'playwright-cli', 'Microsoft''s Playwright CLI skill for proving the change in a real browser: end-to-end flows, selectors, and reliable assertions.'),

-- essentials
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 0, 'vercel-labs', 'skills', 'find-skills', 'The meta-skill: search the wider ecosystem and install what you need before building a capability from scratch.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 1, 'othmanadi', 'planning-with-files', 'planning-with-files', 'Persistent file-based planning that survives context compaction, built for the Agent Skills standard across 60+ agents.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 2, 'mattpocock', 'skills', 'grill-me', 'Matt Pocock''s grill-me interrogates a plan until the weak assumptions surface, before any code moves.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 3, 'obra', 'superpowers', 'systematic-debugging', 'The superpowers module reviewers keep at every model tier: reproduce, isolate, hypothesize, fix.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 4, 'mattpocock', 'skills', 'tdd', 'Matt Pocock''s portable red-green-refactor loop keeps agent work grounded in a failing test.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 5, 'anthropics', 'skills', 'webapp-testing', 'Anthropic''s webapp-testing makes the agent prove its change in a running browser before calling it done.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 6, 'anthropics', 'skills', 'skill-creator', 'The most useful skill is often one you built yourself; skill-creator authors a concise SKILL.md agents can actually discover and apply.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'essentials'), 7, 'anthropics', 'skills', 'frontend-design', 'Anthropic''s frontend-design commits the agent to an aesthetic direction before code, the baseline against default-looking output.'),

-- vue-nuxt
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 0, 'vuejs-ai', 'skills', 'vue-best-practices', 'The canonical Vue best-practices skill from the Vue AI org: the source everyone else vendors, keeping agents off Options API and stale patterns.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 1, 'onmax', 'nuxt-skills', 'nuxt', 'Max''s Nuxt skill adds Nuxt 4 server routes, file routing, middleware, composables, h3, Nitro, and current framework conventions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 2, 'antfu', 'skills', 'vue', 'Anthony Fu''s docs-generated Vue skill, auto-synced from upstream so composition and reactivity guidance tracks releases.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 3, 'nuxt', 'ui', 'nuxt-ui', 'The official Nuxt UI skill from the nuxt org: the component layer for Nuxt apps, straight from the source.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 4, 'vueuse', 'skills', 'vueuse-functions', 'The official VueUse skill keeps agents reaching for the right composable instead of reinventing browser wiring.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 5, 'antfu', 'skills', 'pinia', 'Anthony Fu''s docs-generated Pinia skill covers the state layer the rest of the stack assumes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 6, 'vuejs-ai', 'skills', 'vue-testing-best-practices', 'The Vue AI org''s testing skill rounds out the stack with Vitest, Vue Test Utils, component testing, mocking, and E2E patterns.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 7, 'harlan-zw', 'harlan-agent-kit', 'nuxt-frontend-design', 'Harlan Wilton''s Nuxt frontend build loop for Nuxt UI v4: design tokens, page building, motion, and polish, from the maintainer of Nuxt SEO.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'vue-nuxt'), 8, 'harlan-zw', 'harlan-agent-kit', 'nuxt-frontend-review', 'The matching adversarial review pass: contract criteria checked against a running dev server before Nuxt frontend work ships.'),

-- codebase-architecture
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 0, 'mattpocock', 'skills', 'improve-codebase-architecture', 'Matt Pocock''s architecture skill finds structural seams, refactoring opportunities, and testability improvements in TypeScript codebases.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 1, 'obra', 'superpowers', 'test-driven-development', 'Keep structural work grounded in a failing test and regression coverage.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 2, 'obra', 'superpowers', 'systematic-debugging', 'Use a disciplined diagnosis loop when structural changes expose a latent bug.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 3, 'mattpocock', 'skills', 'domain-modeling', 'Make domain boundaries explicit before code starts moving.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 4, 'mattpocock', 'skills', 'grill-me', 'Matt Pocock''s grill-me interrogates a plan until the weak assumptions surface, before any code moves.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'codebase-architecture'), 5, 'obra', 'superpowers', 'writing-plans', 'Turn a structural change into sequenced work an agent can execute and verify.'),

-- frontend-design
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 0, 'pbakaus', 'impeccable', 'impeccable', 'Paul Bakaus''s Impeccable gives agents stronger frontend judgment for critique, polish, accessibility, responsive behavior, motion, and design systems.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 1, 'anthropics', 'skills', 'frontend-design', 'Anthropic''s frontend-design skill is the broad baseline for distinctive, production-grade interfaces.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 2, 'vercel-labs', 'agent-skills', 'web-design-guidelines', 'Vercel''s web-design-guidelines encode a strict quality bar for typography, spacing, and modern web interfaces.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 3, 'nutlope', 'hallmark', 'hallmark', 'Hassan El Mghari''s Hallmark fights default-AI sameness with real themes and slop-test gates, so generated interfaces stop looking generated.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 4, 'ibelick', 'ui-skills', 'baseline-ui', 'Julien Thibeaut''s baseline-ui pins the minimum visual quality bar so later polish is additive, not corrective.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'frontend-design'), 5, 'ibelick', 'ui-skills', 'fixing-motion-performance', 'fixing-motion-performance catches the janky transitions and animations that make even a good design feel cheap.'),

-- react
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 0, 'vercel-labs', 'agent-skills', 'react-best-practices', 'Vercel''s React playbook is the right default for modern React work, from the team behind Next.js.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 1, 'vercel-labs', 'vercel-plugin', 'nextjs', 'Vercel''s canonical Next.js reference: App Router, server components, caching, and current framework conventions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 2, 'shadcn', 'ui', 'shadcn', 'shadcn/ui''s own skill covers component composition, theming, and the patterns the library was designed around.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 3, 'vercel-labs', 'agent-skills', 'composition-patterns', 'Vercel''s composition-patterns teaches the component composition that keeps React codebases flexible as they grow.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 4, 'deckardger', 'tanstack-agent-skills', 'tanstack-query', 'TanStack Query patterns for the data-fetching layer most React product work sits on.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 5, 'millionco', 'react-doctor', 'react-doctor', 'Million''s React Doctor diagnoses wasted re-renders and performance issues on real component trees.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'react'), 6, 'vercel', 'next.js', 'next-cache-components-optimizer', 'Shipped inside the Next.js repo and version-matched to the framework, this skill untangles the Next 16 caching model agents most often get wrong.'),

-- web-quality
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 0, 'addyosmani', 'web-quality-skills', 'web-quality-audit', 'Addy Osmani''s web-quality-audit is the right umbrella skill for Lighthouse-style performance, accessibility, SEO, and best-practice review.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 1, 'addyosmani', 'web-quality-skills', 'core-web-vitals', 'Core Web Vitals is the focused performance skill for LCP, INP, CLS, layout shifts, and page experience work.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 2, 'addyosmani', 'web-quality-skills', 'performance', 'Performance covers JS, network, and rendering optimization for real-world pages.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 3, 'addyosmani', 'web-quality-skills', 'accessibility', 'Accessibility gives the stack a dedicated WCAG and assistive-tech pass alongside the broader audit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 4, 'addyosmani', 'web-quality-skills', 'seo', 'SEO closes the discoverability gap that Lighthouse partly catches but undercounts in practice.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'web-quality'), 5, 'addyosmani', 'web-quality-skills', 'best-practices', 'Best Practices covers security, browser compatibility, and modern web quality checks that sit beside raw performance.'),

-- backend-data
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 0, 'supabase', 'agent-skills', 'supabase-postgres-best-practices', 'Supabase''s Postgres best-practices skill from the source: schema, RLS, migrations, and SQL patterns that hold up in production.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 1, 'better-auth', 'skills', 'best-practices', 'Better Auth''s best-practices skill is the right reference when agents are wiring up sessions, OAuth, and modern auth flows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 2, 'stripe', 'ai', 'stripe-best-practices', 'Stripe''s own best-practices skill covers the payments wiring a solo shipper cannot afford to get wrong.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 3, 'get-convex', 'agent-skills', 'convex-quickstart', 'Convex Quickstart is the canonical fast path for an agent dropping a typed, reactive backend into a project.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 4, 'firebase', 'skills', 'firebase-basics', 'Firebase Basics is the official entry point for agents wiring up Firestore, auth, and hosting.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'backend-data'), 5, 'resend', 'resend-skills', 'resend', 'Resend''s official skill handles the transactional email every shipped product eventually needs.'),

-- browser-automation
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 0, 'microsoft', 'playwright-cli', 'playwright-cli', 'Microsoft''s Playwright CLI skill for driving real browsers end to end: navigation, selectors, and reliable assertions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 1, 'vercel-labs', 'agent-browser', 'agent-browser', 'Vercel''s agent-browser is the widest-used browser skill: a purpose-built driver for agents clicking through real pages.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 2, 'browser-use', 'browser-use', 'browser-use', 'browser-use is the canonical open-source pick when agents need to drive a real browser through multi-step flows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 3, 'anthropics', 'skills', 'webapp-testing', 'Anthropic''s webapp-testing closes the loop: the agent proves its change works in a running browser before calling it done.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 4, 'firecrawl', 'cli', 'firecrawl-cli', 'Firecrawl is the right tool when the goal is pulling clean structured content out of the web rather than clicking through a UI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'browser-automation'), 5, 'firecrawl', 'cli', 'firecrawl-scrape', 'firecrawl-scrape is the focused single-URL fetch when an agent only needs one page rendered and converted.'),

-- apple-apps
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 0, 'twostraws', 'swiftui-agent-skill', 'swiftui-pro', 'Paul Hudson''s SwiftUI skill carries the Hacking with Swift teaching lineage: modern SwiftUI written the way he teaches it.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 1, 'dimillian', 'skills', 'swiftui-ui-patterns', 'Thomas Ricouard''s SwiftUI UI Patterns skill is the broadest Apple UI baseline for modern SwiftUI screens, navigation, state, and components.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 2, 'dimillian', 'skills', 'swift-concurrency-expert', 'Swift Concurrency Expert covers Swift 6.2 actor isolation, Sendable, async/await migration, and data-race remediation.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 3, 'dimillian', 'skills', 'swiftui-performance-audit', 'SwiftUI Performance Audit catches janky rendering, excessive updates, layout thrash, CPU, and memory issues.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 4, 'twostraws', 'swift-testing-agent-skill', 'swift-testing-pro', 'Paul Hudson''s Swift Testing skill brings the modern testing framework''s idioms into agent-written test suites.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'apple-apps'), 5, 'dimillian', 'skills', 'ios-debugger-agent', 'ios-debugger-agent handles iOS-specific crash diagnosis, signposts, and the parts of debugging that don''t map to generic web tools.'),

-- knowledge-workspace
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 0, 'kepano', 'obsidian-skills', 'obsidian-markdown', 'Steph Ango''s Obsidian Markdown skill is the canonical base for notes, wikilinks, embeds, callouts, properties, and Obsidian-flavored markdown.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 1, 'kepano', 'obsidian-skills', 'obsidian-bases', 'Obsidian Bases adds database-like views, filters, formulas, and summaries for modern vault workflows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 2, 'kepano', 'obsidian-skills', 'defuddle', 'Defuddle gives agents clean web-to-markdown extraction for saving docs, articles, and references into knowledge bases.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 3, 'kepano', 'obsidian-skills', 'obsidian-cli', 'obsidian-cli lets an agent script vault operations end-to-end without depending on the GUI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 4, 'kepano', 'obsidian-skills', 'json-canvas', 'json-canvas is the standard for working with Obsidian canvas files programmatically, thinking maps the agent can edit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'knowledge-workspace'), 5, 'mattpocock', 'skills', 'obsidian-vault', 'Matt Pocock''s obsidian-vault adds an opinionated working-with-a-vault layer on top of the raw markdown tooling.'),

-- code-review
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 0, 'pbakaus', 'agent-reviews', 'resolve-agent-reviews', 'Paul Bakaus''s resolve-agent-reviews skill focuses on working through bot findings, fixing real bugs, dismissing false positives, and replying with outcomes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 1, 'obra', 'superpowers', 'requesting-code-review', 'requesting-code-review gives agents a disciplined way to ask for review and respond to comments.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 2, 'obra', 'superpowers', 'receiving-code-review', 'receiving-code-review is the matching half: turning review threads into clean follow-up commits.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 3, 'brianlovin', 'claude-config', 'fix-sentry-issues', 'Brian Lovin''s Sentry skill ties cleanup to production issue discovery, triage, and root-cause fixes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 4, 'obra', 'superpowers', 'systematic-debugging', 'Systematic debugging is the right tool when a review comment surfaces a real bug rather than a style nit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'code-review'), 5, 'dimillian', 'skills', 'review-and-simplify-changes', 'review-and-simplify-changes is the self-review pass that catches over-engineered cleanup before it lands.'),

-- agent-workflow
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 0, 'obra', 'superpowers', 'subagent-driven-development', 'Split a larger plan into focused tasks, with review between each result.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 1, 'obra', 'superpowers', 'dispatching-parallel-agents', 'Run independent investigations in parallel before changing code.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 2, 'obra', 'superpowers', 'verification-before-completion', 'Require fresh evidence before the agent declares the work complete.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 3, 'mattpocock', 'skills', 'handoff', 'Matt Pocock''s handoff carries full context between agent sessions so long work survives a fresh start.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 4, 'othmanadi', 'planning-with-files', 'planning-with-files', 'File-based plans that survive compaction and travel across agents, keeping multi-pass work on rails.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-workflow'), 5, 'obra', 'superpowers', 'executing-plans', 'Move through written steps without redesigning the plan midway through execution.'),

-- agent-building
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 0, 'vercel-labs', 'skills', 'find-skills', 'Search the wider skill ecosystem before building a capability from scratch.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 1, 'openai', 'skills', 'skill-installer', 'Install a curated skill or pull one directly from a public or private GitHub repository.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 2, 'anthropics', 'skills', 'skill-creator', 'Author a concise SKILL.md that agents can discover, load, and apply reliably.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 3, 'obra', 'superpowers', 'writing-skills', 'Test skill behavior against pressure scenarios, then refine its triggers and instructions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 4, 'callstackincubator', 'agent-skills', 'validate-skills', 'Check skill structure, metadata, loading paths, and authoring practices before publishing.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw') AND slug = 'agent-building'), 5, 'anthropics', 'skills', 'mcp-builder', 'Design and wire up a Model Context Protocol server for a new tool.');

-- Transition: keep the previously deployed featured trio alive and featured
-- with low featured_at values so the hardcoded homepage query keeps working
-- until the DB-driven featured endpoint ships.
UPDATE collections_v2
SET featured = 1,
    featured_at = CAST(strftime('%s','now') AS INTEGER) - 1000,
    deleted_at = NULL,
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlan-zw')
  AND slug IN ('agent-building-stack', 'typescript-engineering-stack', 'agent-workflow-stack');
