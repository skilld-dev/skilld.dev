-- Seed homepage editorial collections.
-- Idempotent: updates these collection slugs and replaces only their entries.
--
-- Picks are informed by the vercel-labs/skills find-skills SKILL.md workflow:
-- https://skills.sh leaderboard, install counts >= ~40K, trusted sources.
-- All owner/repo/name triplets verified against the local skills table so
-- the homepage links resolve.

INSERT OR IGNORE INTO users (
  github_id, login, name, created_at, last_login_at
) VALUES (
  -1, 'harlanzw', 'Harlan Wilton',
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER)
);

INSERT INTO collections_v2 (
  author_user_id, slug, name, preamble, featured, featured_at, created_at, updated_at, deleted_at
) VALUES
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'frontend-ui-stack',
  'Frontend Design',
  'Concrete frontend UI polish: interface critique, baseline quality, responsive behavior, motion, accessibility fixes, and cleaner component work.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 140,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'react-stack',
  'React stack',
  'The most-installed React skills on skills.sh: production patterns from the Vercel team plus the canonical shadcn/ui component playbook.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 130,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'typescript-engineering-stack',
  'Architecture stack',
  'Planning, architecture, testing strategy, and codebase diagnosis skills for agents making structural changes.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 120,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'web-quality-stack',
  'Performance stack',
  'Skills from Addy Osmani and frontend specialists for performance audits, Core Web Vitals, motion smoothness, accessibility, SEO, and modern web quality before you ship.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 110,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'frontend-ux-stack',
  'Frontend UX stack',
  'User-facing quality for shipped frontend work: speed, Core Web Vitals, accessibility, clarity, browser checks, and product-minded cleanup.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 100,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'vue-nuxt-stack',
  'Vue and Nuxt stack',
  'A coherent Vue and Nuxt agent setup from framework people and ecosystem specialists.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 90,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'backend-data-stack',
  'Backend and data stack',
  'High-install backend skills for agents wiring up databases, auth, and realtime: Supabase Postgres, Firebase, Convex, and Better Auth.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 80,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'agent-workflow-stack',
  'Agent workflow stack',
  'Skills for running an agent like an engineering workflow: careful changes, parallel review, systematic debugging, and shipping.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 70,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'agent-building-stack',
  'Agent building stack',
  'Build your own agent capabilities: discovering skills, creating skills, wiring up MCP, and delegating work to subagents.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 60,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'browser-automation-stack',
  'Browser automation stack',
  'When an agent needs to drive a browser: scrape pages, click through flows, and pull structured content into the loop.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 50,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'apple-app-stack',
  'Apple app stack',
  'SwiftUI and Swift concurrency skills for modern iOS and macOS app work.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 40,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'knowledge-workspace-stack',
  'Knowledge workspace stack',
  'Skills for agents working inside Obsidian vaults, markdown knowledge bases, canvas files, and cleaned-up web content.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 30,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'pr-review-cleanup-stack',
  'PR review cleanup stack',
  'Skills for turning review comments, bot findings, production issues, and diagnosis loops into fixed code.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 20,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  NULL
),
(
  (SELECT id FROM users WHERE login = 'harlanzw'),
  'design-stack',
  'Design stack',
  'More abstract design judgment: taste, critique, simplification, and visual direction after the concrete frontend UI and UX work is covered.',
  1,
  CAST(strftime('%s','now') AS INTEGER) + 10,
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

UPDATE collections_v2
SET featured = 0,
    updated_at = CAST(strftime('%s','now') AS INTEGER)
WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw')
  AND slug = 'frontend-taste-stack';

DELETE FROM collection_skills_v2
WHERE collection_id IN (
  SELECT id
  FROM collections_v2
  WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw')
    AND slug IN (
      'web-quality-stack',
      'frontend-ui-stack',
      'frontend-ux-stack',
      'typescript-engineering-stack',
      'vue-nuxt-stack',
      'agent-workflow-stack',
      'apple-app-stack',
      'knowledge-workspace-stack',
      'pr-review-cleanup-stack',
      'design-stack',
      'react-stack',
      'backend-data-stack',
      'agent-building-stack',
      'browser-automation-stack'
    )
);

INSERT INTO collection_skills_v2 (collection_id, position, owner, repo, name, reason) VALUES
-- frontend-ui-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 0, 'pbakaus', 'impeccable', 'impeccable', 'Paul Bakaus''s Impeccable gives agents stronger frontend judgment for critique, polish, accessibility, responsive behavior, motion, and design systems.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 1, 'anthropics', 'skills', 'frontend-design', 'Anthropic''s official frontend-design skill (402K installs) is the broad baseline for distinctive, production-grade interfaces.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 2, 'vercel-labs', 'agent-skills', 'web-design-guidelines', 'Vercel''s web-design-guidelines (314K installs) is a leaderboard-top quality bar for typography, spacing, and modern web interfaces.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 3, 'anthropics', 'skills', 'theme-factory', 'theme-factory generates cohesive color and typography systems when an interface needs a real brand instead of default Tailwind.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 4, 'vercel-labs', 'agent-skills', 'vercel-react-view-transitions', 'View-transitions adds first-class browser transition patterns that lift the perceived quality of navigation and state changes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ui-stack'), 5, 'emilkowalski', 'skill', 'emil-design-eng', 'Emil Kowalski''s design engineering skill adds the invisible-details lens: micro-interactions, motion, and component polish that make software feel deliberate.'),

-- react-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 0, 'vercel-labs', 'agent-skills', 'vercel-react-best-practices', 'Vercel''s React best-practices skill is the #3 most-installed skill on skills.sh (393K) - the right default for modern React work.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 1, 'shadcn', 'ui', 'shadcn', 'shadcn/ui''s own skill (138K installs) covers component composition, theming, and the patterns the library was designed around.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 2, 'vercel-labs', 'agent-skills', 'vercel-react-native-skills', 'Vercel''s React Native pack (115K installs) extends the same React judgment to mobile when the stack reaches beyond the browser.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 3, 'vercel-labs', 'next-skills', 'next-best-practice', 'Vercel''s Next best-practice skill is the canonical reference for App Router, server components, caching, and modern Next conventions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 4, 'dimillian', 'skills', 'react-component-performance', 'React component performance focuses on render cost, memoization, and the invisible re-renders that quietly tank a UI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'react-stack'), 5, 'vercel-labs', 'vercel-plugin', 'react-best-practices', 'The plugin-style React best-practices pack is the right companion when deployment runs through Vercel''s platform.'),

-- typescript-engineering-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 0, 'mattpocock', 'skills', 'improve-codebase-architecture', 'Matt Pocock''s architecture skill is the strongest fit for structural decisions, refactoring opportunities, testability, and AI-navigable TypeScript codebases.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 1, 'obra', 'superpowers', 'test-driven-development', 'obra/superpowers TDD skill (80K installs) keeps architecture work grounded in red-green-refactor and regression coverage.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 2, 'obra', 'superpowers', 'systematic-debugging', 'Systematic debugging (93K installs) gives agents a disciplined diagnosis loop when structural changes surface latent bugs.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 3, 'mattpocock', 'skills', 'domain-model', 'Domain modeling is the missing first step before refactors - it makes the boundaries explicit before the code moves.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 4, 'mattpocock', 'skills', 'ubiquitous-language', 'Ubiquitous-language keeps types, names, and docs aligned with the domain so the code stays readable as it grows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'typescript-engineering-stack'), 5, 'obra', 'superpowers', 'writing-plans', 'Writing-plans turns vague architecture work into a sequenced plan an agent can execute and verify.'),

-- web-quality-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 0, 'addyosmani', 'web-quality-skills', 'web-quality-audit', 'Addy Osmani''s web-quality-audit is the right umbrella skill for Lighthouse-style performance, accessibility, SEO, and best-practice review.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 1, 'addyosmani', 'web-quality-skills', 'core-web-vitals', 'Core Web Vitals is the focused performance skill for LCP, INP, CLS, layout shifts, and page experience work.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 2, 'addyosmani', 'web-quality-skills', 'performance', 'Performance covers JS, network, and rendering optimization for real-world pages.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 3, 'addyosmani', 'web-quality-skills', 'accessibility', 'Accessibility gives the stack a dedicated WCAG and assistive-tech pass alongside the broader audit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 4, 'addyosmani', 'web-quality-skills', 'seo', 'SEO closes the discoverability gap that Lighthouse partly catches but undercounts in practice.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'web-quality-stack'), 5, 'addyosmani', 'web-quality-skills', 'best-practices', 'Best Practices covers security, browser compatibility, and modern web quality checks that sit beside raw performance.'),

-- frontend-ux-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 0, 'pbakaus', 'impeccable', 'impeccable', 'Impeccable anchors UX in human-facing clarity, visual hierarchy, layout, flow, polish, responsive behavior, and whether the interface feels good to use.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 1, 'ibelick', 'ui-skills', 'fixing-accessibility', 'Fixing Accessibility gives the stack concrete WCAG, keyboard, focus, ARIA, contrast, and form-error coverage.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 2, 'brianlovin', 'claude-config', 'rams', 'Brian Lovin''s Rams skill adds pragmatic accessibility and visual design review on real components.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 3, 'ibelick', 'ui-skills', 'fixing-motion-performance', 'Fixing-motion-performance catches the janky transitions and animations that make even a good design feel cheap.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 4, 'ibelick', 'ui-skills', 'baseline-ui', 'Baseline-ui pins down the minimum-viable visual quality bar so the rest of the polish is additive, not corrective.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'frontend-ux-stack'), 5, 'ibelick', 'ui-skills', 'fixing-metadata', 'Fixing-metadata covers the social-share, favicon, and document-level details that quietly shape first impressions.'),

-- vue-nuxt-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 0, 'antfu', 'skills', 'vue-best-practices', 'Anthony Fu''s Vue best-practices skill is the right default for Vue 3, script setup, TypeScript, SSR, Volar, and vue-tsc work.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 1, 'onmax', 'nuxt-skills', 'nuxt', 'Max''s Nuxt skill adds Nuxt 4 server routes, file routing, middleware, composables, h3, Nitro, and current framework conventions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 2, 'hyf0', 'vue-skills', 'vue-testing-best-practices', 'Yunfei He''s Vue testing skill rounds out the stack with Vitest, Vue Test Utils, component testing, mocking, and E2E patterns.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 3, 'antfu', 'skills', 'vue', 'antfu/vue covers core composition, reactivity, and patterns that the best-practices skill assumes as background.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 4, 'onmax', 'nuxt-skills', 'nuxt-ui', 'nuxt-ui is the canonical component layer for Nuxt apps that need a real design system out of the box.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'vue-nuxt-stack'), 5, 'onmax', 'nuxt-skills', 'nuxt-content', 'nuxt-content covers markdown-first, file-based content - the standard answer when a Nuxt app also needs docs or a blog.'),

-- backend-data-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 0, 'supabase', 'agent-skills', 'supabase-postgres-best-practices', 'Supabase''s Postgres best-practices skill (161K installs) is the leaderboard-top pick for schema, RLS, migrations, and SQL patterns that hold up in production.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 1, 'firebase', 'agent-skills', 'firebase-basics', 'Firebase Basics is the official entry point for agents wiring up Firestore, auth, and hosting.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 2, 'get-convex', 'agent-skills', 'convex-quickstart', 'Convex Quickstart is the canonical fast path for an agent dropping a typed, reactive backend into a project.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 3, 'better-auth', 'skills', 'better-auth-best-practices', 'Better Auth''s best-practices skill is the right reference when agents are wiring up sessions, OAuth, and modern auth flows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 4, 'firebase', 'agent-skills', 'firebase-auth-basics', 'firebase-auth-basics is the focused companion when the agent only needs Firebase for identity, not the whole stack.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'backend-data-stack'), 5, 'supabase', 'agent-skills', 'supabase', 'The broader Supabase skill covers the client SDK, edge functions, and the parts that sit above raw Postgres.'),

-- agent-workflow-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 0, 'obra', 'superpowers', 'subagent-driven-development', 'obra/superpowers subagent-driven-development (69K installs) is the canonical loop for delegating discrete work to focused subagents.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 1, 'obra', 'superpowers', 'dispatching-parallel-agents', 'Dispatching parallel agents (62K installs) covers running multiple read-only investigators in parallel before changing code.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 2, 'obra', 'superpowers', 'verification-before-completion', 'Verification-before-completion forces the agent to prove the work landed before declaring done - the single best guard against overclaiming.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 3, 'brianlovin', 'claude-config', 'workflow', 'Brian Lovin''s workflow skill ties the loop together with a practical planning, execution, and cleanup pattern.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 4, 'obra', 'superpowers', 'using-superpowers', 'using-superpowers is the meta-skill that orchestrates the rest of the obra workflow set into one coherent loop.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-workflow-stack'), 5, 'obra', 'superpowers', 'executing-plans', 'executing-plans pairs with writing-plans so the agent actually moves through the steps instead of redesigning mid-flight.'),

-- agent-building-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 0, 'anthropics', 'skills', 'skill-creator', 'Anthropic''s skill-creator (202K installs) is the canonical skill for authoring new SKILL.md files that actually load and work.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 1, 'vercel-labs', 'skills', 'find-skills', 'Vercel''s find-skills (1.5M installs, #1 on skills.sh) is the discovery layer that points agents at the rest of the ecosystem.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 2, 'anthropics', 'skills', 'mcp-builder', 'mcp-builder (53K installs) gives agents the patterns for designing and wiring up a Model Context Protocol server.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 3, 'obra', 'superpowers', 'writing-skills', 'obra/superpowers writing-skills covers the day-to-day craft of capturing reusable expertise as a SKILL.md.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 4, 'anthropics', 'skills', 'template-skill', 'template-skill is the official scaffolding starting point - the fastest way to a SKILL.md that loads correctly on first try.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'agent-building-stack'), 5, 'obra', 'superpowers', 'using-superpowers', 'using-superpowers shows how the authored skills actually get composed at runtime, which closes the build/use loop.'),

-- browser-automation-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 0, 'vercel-labs', 'vercel-plugin', 'agent-browser', 'Vercel''s agent-browser (265K installs on skills.sh) is the leaderboard-top headless-browser-for-agents skill.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 1, 'browser-use', 'browser-use', 'browser-use', 'browser-use (74K installs) is the canonical open-source pick when agents need to drive a real browser through multi-step flows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 2, 'firecrawl', 'cli', 'firecrawl', 'Firecrawl is the right tool when the goal is pulling clean structured content out of the web rather than clicking through a UI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 3, 'firecrawl', 'cli', 'firecrawl-scrape', 'firecrawl-scrape is the focused single-URL fetch when an agent only needs one page rendered and converted.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 4, 'firecrawl', 'cli', 'firecrawl-crawl', 'firecrawl-crawl handles the multi-page traversal case so the agent doesn''t reinvent breadth-first crawling.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'browser-automation-stack'), 5, 'browser-use', 'browser-use', 'open-source', 'The open-source pack covers the self-hosted side of browser-use when SaaS isn''t an option.'),

-- apple-app-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 0, 'dimillian', 'skills', 'swiftui-ui-patterns', 'Thomas Ricouard''s SwiftUI UI Patterns skill is the broadest Apple UI baseline for modern SwiftUI screens, navigation, state, and components.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 1, 'dimillian', 'skills', 'swift-concurrency-expert', 'Swift Concurrency Expert covers Swift 6.2 actor isolation, Sendable, async/await migration, and data-race remediation.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 2, 'dimillian', 'skills', 'swiftui-performance-audit', 'SwiftUI Performance Audit catches janky rendering, excessive updates, layout thrash, CPU, and memory issues.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 3, 'dimillian', 'skills', 'swiftui-liquid-glass', 'swiftui-liquid-glass covers the modern iOS 18+ Liquid Glass material so SwiftUI apps look native on current OS versions.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 4, 'dimillian', 'skills', 'swiftui-view-refactor', 'swiftui-view-refactor is the cleanup pass when views grow into 500-line monoliths that are hard to reason about.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'apple-app-stack'), 5, 'dimillian', 'skills', 'ios-debugger-agent', 'ios-debugger-agent handles iOS-specific crash diagnosis, signposts, and the parts of debugging that don''t map to generic web tools.'),

-- knowledge-workspace-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 0, 'kepano', 'obsidian-skills', 'obsidian-markdown', 'Steph Ango''s Obsidian Markdown skill is the canonical base for notes, wikilinks, embeds, callouts, properties, and Obsidian-flavored markdown.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 1, 'kepano', 'obsidian-skills', 'obsidian-bases', 'Obsidian Bases adds database-like views, filters, formulas, and summaries for modern vault workflows.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 2, 'kepano', 'obsidian-skills', 'defuddle', 'Defuddle gives agents clean web-to-markdown extraction for saving docs, articles, and references into knowledge bases.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 3, 'kepano', 'obsidian-skills', 'obsidian-cli', 'obsidian-cli lets an agent script vault operations end-to-end without depending on the GUI.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 4, 'kepano', 'obsidian-skills', 'json-canvas', 'json-canvas is the standard for working with Obsidian canvas files programmatically - thinking maps the agent can edit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'knowledge-workspace-stack'), 5, 'mattpocock', 'skills', 'obsidian-vault', 'Matt Pocock''s obsidian-vault adds an opinionated working-with-a-vault layer on top of the raw markdown tooling.'),

-- pr-review-cleanup-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 0, 'pbakaus', 'agent-reviews', 'resolve-agent-reviews', 'Paul Bakaus''s resolve-agent-reviews skill focuses on working through bot findings, fixing real bugs, dismissing false positives, and replying with outcomes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 1, 'obra', 'superpowers', 'requesting-code-review', 'obra/superpowers requesting-code-review (81K installs) gives agents a disciplined way to ask for review and respond to comments.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 2, 'obra', 'superpowers', 'receiving-code-review', 'receiving-code-review (64K installs) is the matching half - turning review threads into clean follow-up commits.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 3, 'brianlovin', 'claude-config', 'fix-sentry-issues', 'Brian Lovin''s Sentry skill ties cleanup to production issue discovery, triage, and root-cause fixes.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 4, 'obra', 'superpowers', 'systematic-debugging', 'Systematic debugging (93K) is the right tool when a review comment surfaces a real bug rather than a style nit.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'pr-review-cleanup-stack'), 5, 'dimillian', 'skills', 'review-and-simplify-changes', 'review-and-simplify-changes is the self-review pass that catches over-engineered cleanup before it lands.'),

-- design-stack
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 0, 'pbakaus', 'impeccable', 'impeccable', 'Use Impeccable here as the abstract design judgment layer: taste, critique, visual quality, interface calm, and deciding what should change.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 1, 'anthropics', 'skills', 'frontend-design', 'Anthropic''s frontend-design skill (402K installs) is the canonical baseline that Impeccable builds beyond.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 2, 'mattpocock', 'skills', 'design-an-interface', 'Matt Pocock''s design-an-interface skill adds API and module interface design exploration, useful when design judgment is about developer-facing shapes rather than screens.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 3, 'anthropics', 'skills', 'brand-guidelines', 'brand-guidelines is the right reference when design judgment is about voice, tone, and visual identity rather than component polish.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 4, 'anthropics', 'skills', 'canvas-design', 'canvas-design covers off-screen design artifacts: diagrams, mood boards, and the visual thinking that precedes the UI itself.'),
((SELECT id FROM collections_v2 WHERE author_user_id = (SELECT id FROM users WHERE login = 'harlanzw') AND slug = 'design-stack'), 5, 'vercel-labs', 'agent-skills', 'web-design-guidelines', 'Vercel''s web-design-guidelines (314K installs) closes the loop with concrete production-grade web standards.');
