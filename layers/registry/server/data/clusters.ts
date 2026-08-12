/**
 * Categories surfaced on the homepage self-selector + `/skills/<slug>` pages.
 *
 * 2026-08-12 rework. Three things changed and each has a reason:
 *
 * 1. **Slugs and titles follow search demand.** The old tracks were verb-shaped
 *    ("Planning and specs", "Shipping and release") and matched no query anyone
 *    types. Demand sits at `claude skills for <domain>` and `claude <domain>
 *    skills`, so `seoTitle` carries that phrasing while `label` keeps the
 *    editorial voice for the H1 (principle 7). VISION principle 6 grants the
 *    SEO carve-out for agent-name queries; it covers meta only, never features.
 *
 * 2. **Harlan's curated collections merged in.** A category page and a
 *    `/@harlan-zw/<slug>` collection were two surfaces answering one question
 *    and competing for one query. The collection's skills became this
 *    category's `pinnedExamples` and its preamble became `curatorNote`.
 *    `mergedFrom` records which collection retired into which category so
 *    scripts/retire-merged-collections.sql stays reconstructible.
 *
 * 3. **`categories` now only contains real classifier values.** Every value is
 *    checked against ABSTRACTNESS_CATEGORIES in ai-prompts.ts. The previous
 *    list carried nine labels the classifier never emits (`agent-meta`,
 *    `docs-writing`, `doc-writing`, `content-writing`, `refactor`,
 *    `git-workflow`, `devops`, `browser-automation`, `testing-strategy`), so
 *    those tracks silently matched nothing but their pinned examples. Values do
 *    not repeat across categories, so skill counts stay honest.
 *
 * Net surfaces: 10 clusters + 13 collections -> 16 categories. Subtraction is
 * the point (principle 2), and this is still a net removal of seven, but the
 * count grew by one after the taxonomy was set: `seo` was added on evidence
 * (~190/mo at KD 0-1, the lowest-difficulty bucket found, and the one non-dev
 * domain the curator authors tooling for). Under principle 2 the next addition
 * retires something; `browser-automation` is the weakest row if one must go.
 *
 * `audience` marks the four non-developer categories admitted on 2026-08-12 as
 * a demand test, against VISION's north-star user. They are deliberately
 * separable: if they pull traffic that never installs, delete the four rows
 * and nothing else changes. `seo` is the likeliest to survive that cull and
 * the likeliest to be reclassified `dev`, since technical SEO is developer work.
 *
 * Stable slugs: these become URLs. Renaming one requires a redirect in
 * nuxt.config.ts. The 2026-08-12 renames were taken because Search Console
 * showed 4 clicks across 3 months, so no ranking existed to protect.
 */

export interface Cluster {
  slug: string
  label: string
  icon: string
  /** Second person, so the grid reads as "pick yourself", not "pick a task". */
  userVoice: string
  /** Keyword-shaped <title>. Editorial voice stays in `label`. */
  seoTitle: string
  seoDescription: string
  /** Curator preamble, inherited from the collection merged into this page. */
  curatorNote: string | null
  /** Collection slug retired into this category, or null if none. */
  mergedFrom: string | null
  /** `dev` is the north-star user. `test` is the 2026-08-12 demand test. */
  audience: 'dev' | 'test'
  /** Must be values ABSTRACTNESS_CATEGORIES actually emits. No repeats. */
  categories: string[]
  /** Hand-picked `owner/name` keys that lead cards and detail pages. */
  pinnedExamples: string[]
}

export const CLUSTERS: Cluster[] = [
  {
    slug: 'design',
    label: 'Design and interface work',
    icon: 'i-lucide-palette',
    userVoice: 'You care how the interface looks, moves, and reads.',
    seoTitle: 'Claude Skills for UI and Design',
    seoDescription:
      'Curated design and UI skills for Claude Code, Cursor, and Codex. Interface feel, motion, accessibility, and component quality, each written by the person who owns that craft.',
    curatorNote:
      'The flagship set for design engineers: interface feel, motion, accessibility, and component quality, plus the testing that proves the work, each skill from the person who owns that craft.',
    mergedFrom: 'design-engineering-essentials',
    audience: 'dev',
    categories: ['design'],
    pinnedExamples: [
      'emilkowalski/emil-design-eng',
      'jakubkrehel/make-interfaces-feel-better',
      'pbakaus/impeccable',
      'vercel-labs/web-design-guidelines',
      'ibelick/fixing-motion-performance',
      'ibelick/fixing-accessibility',
      'ibelick/baseline-ui',
      'nutlope/hallmark',
      'shadcn/shadcn',
    ],
  },
  {
    slug: 'coding',
    label: 'Everyday coding',
    icon: 'i-lucide-code',
    userVoice: 'You want the handful of skills that earn their context on every project.',
    seoTitle: 'Claude Skills for Coding',
    seoDescription:
      'The coding skills worth installing first, curated for Claude Code, Cursor, and Codex. Plan, verify, debug, test, and model a domain, every skill from a maintainer you can read before you run it.',
    curatorNote:
      'Cross-stack first installs that work in any agent: plan, verify, debug, test, and a design baseline. Every skill is a context tax; these are the ones that earn it.',
    mergedFrom: 'essentials',
    audience: 'dev',
    categories: ['framework', 'rendering'],
    pinnedExamples: [
      'vercel-labs/find-skills',
      'othmanadi/planning-with-files',
      'mattpocock/grill-me',
      'obra/systematic-debugging',
      'mattpocock/tdd',
      'mattpocock/improve-codebase-architecture',
      'mattpocock/domain-modeling',
      'anthropics/frontend-design',
    ],
  },
  {
    slug: 'context-engineering',
    label: 'Agent workflows',
    icon: 'i-lucide-zap',
    userVoice: 'You run agents in parallel and verify what they hand back.',
    seoTitle: 'Agent Skills for Context Engineering',
    seoDescription:
      'Context engineering skills for agent workflows: delegate to subagents, run passes in parallel, verify before completion, and hand off a clean branch. Works with Claude Code, Cursor, and Codex.',
    curatorNote:
      'Run multi-pass changes with focused delegation, parallel work, verification, and a clean branch handoff, then build the skill you were missing.',
    mergedFrom: 'agent-workflow',
    audience: 'dev',
    categories: ['automation'],
    pinnedExamples: [
      'obra/subagent-driven-development',
      'obra/dispatching-parallel-agents',
      'obra/verification-before-completion',
      'mattpocock/handoff',
      'obra/executing-plans',
      'anthropics/skill-creator',
      'obra/writing-skills',
      'openai/skill-installer',
      'callstackincubator/validate-skills',
      'anthropics/mcp-builder',
    ],
  },
  {
    slug: 'code-review',
    label: 'Review and refactoring',
    icon: 'i-lucide-eye',
    userVoice: 'You read other people\'s code and reshape it without breaking it.',
    seoTitle: 'Claude Skills for Code Review',
    seoDescription:
      'Code review and refactoring skills for AI agents. Turn review comments, bot findings, and production issues into fixed code, with skills written by maintainers who review for a living.',
    curatorNote:
      'Turn review comments, bot findings, and production issues into fixed code.',
    mergedFrom: 'code-review',
    audience: 'dev',
    categories: ['code-review', 'refactoring'],
    pinnedExamples: [
      'pbakaus/resolve-agent-reviews',
      'obra/requesting-code-review',
      'obra/receiving-code-review',
      'brianlovin/fix-sentry-issues',
      'dimillian/review-and-simplify-changes',
      'github/refactor',
    ],
  },
  {
    slug: 'testing',
    label: 'Testing and QA',
    icon: 'i-lucide-flask-conical',
    userVoice: 'You want tests that prove the change, not tests that pass.',
    seoTitle: 'Claude Skills for Testing',
    seoDescription:
      'Testing skills for Claude Code and other agents: test-driven development, coverage assessment, browser and webapp testing, and verifying external behaviour rather than implementation detail.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'dev',
    categories: ['testing'],
    pinnedExamples: [
      'mattpocock/tdd',
      'obra/test-driven-development',
      'bitwarden/assessing-test-coverage',
      'github/playwright-explore-website',
      'wdm0006/verifying-external-behavior',
      'anthropics/webapp-testing',
    ],
  },
  {
    slug: 'debugging',
    label: 'Debugging and incidents',
    icon: 'i-lucide-bug',
    userVoice: 'You chase failures down to a cause and write up what happened.',
    seoTitle: 'Claude Skills for Debugging',
    seoDescription:
      'Debugging skills for AI agents: work a failure down to its cause, investigate autonomously, and write the post-mortem. Curated from maintainers who debug production systems.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'dev',
    categories: ['incident-response', 'observability'],
    pinnedExamples: [
      'obra/systematic-debugging',
      'deanpeters/autonomous-investigation',
      'boshu2/post-mortem',
    ],
  },
  {
    slug: 'performance',
    label: 'Performance and web quality',
    icon: 'i-lucide-gauge',
    userVoice: 'You profile the slow path before you ship it.',
    seoTitle: 'Claude Skills for Web Performance',
    seoDescription:
      'Performance and web quality skills for agents: Core Web Vitals, performance audits, accessibility, and the checks that run before you ship. Includes Addy Osmani\'s web quality suite.',
    curatorNote:
      'Addy Osmani\'s web quality suite: performance audits, Core Web Vitals, accessibility, SEO, and best practices before you ship.',
    mergedFrom: 'web-quality',
    audience: 'dev',
    categories: ['performance'],
    pinnedExamples: [
      'addyosmani/web-quality-audit',
      'addyosmani/core-web-vitals',
      'addyosmani/performance',
      'addyosmani/accessibility',
      'addyosmani/seo',
      'addyosmani/best-practices',
      'millionco/react-doctor',
    ],
  },
  {
    slug: 'security',
    label: 'Security and auth',
    icon: 'i-lucide-shield',
    userVoice: 'You think about the threat model before the feature ships.',
    seoTitle: 'Claude Skills for Security',
    seoDescription:
      'Security and auth skills for AI agents: threat modelling, integrity audits, and authentication patterns. Read the source before you run it, on every skill listed here.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'dev',
    categories: ['security', 'auth'],
    pinnedExamples: [
      'wshobson/stride-analysis-patterns',
      'github/audit-integrity',
      'bitwarden/bitwarden-security-context',
      'wshobson/auth-implementation-patterns',
      'better-auth/best-practices',
    ],
  },
  {
    slug: 'backend-data',
    label: 'Backend and data',
    icon: 'i-lucide-database',
    userVoice: 'You wire up the database, the auth, and the realtime layer.',
    seoTitle: 'Claude Skills for Backend and Databases',
    seoDescription:
      'Backend and database skills for agents, each from the team that builds the product: Supabase Postgres, Convex, Firebase, Stripe, Resend, and Better Auth.',
    curatorNote:
      'Backend skills for agents wiring up databases, auth, and realtime: Supabase Postgres, Firebase, Convex, and Better Auth, each from the team that builds it.',
    mergedFrom: 'backend-data',
    audience: 'dev',
    categories: ['data-modeling'],
    pinnedExamples: [
      'supabase/supabase-postgres-best-practices',
      'stripe/stripe-best-practices',
      'get-convex/convex-quickstart',
      'firebase/firebase-basics',
      'resend/resend',
    ],
  },
  {
    slug: 'browser-automation',
    label: 'Browser automation',
    icon: 'i-lucide-mouse-pointer-click',
    userVoice: 'You need the agent to drive a real browser and bring back structure.',
    seoTitle: 'Claude Skills for Browser Automation',
    seoDescription:
      'Browser automation skills for AI agents: drive Playwright, click through real flows, scrape pages, and pull structured content back into the loop.',
    curatorNote:
      'When an agent needs to drive a browser: scrape pages, click through flows, and pull structured content into the loop.',
    mergedFrom: 'browser-automation',
    audience: 'dev',
    categories: ['scraping'],
    pinnedExamples: [
      'microsoft/playwright-cli',
      'vercel-labs/agent-browser',
      'browser-use/browser-use',
      'firecrawl/firecrawl-cli',
      'firecrawl/firecrawl-scrape',
    ],
  },
  {
    slug: 'devops',
    label: 'Shipping and release',
    icon: 'i-lucide-git-branch',
    userVoice: 'You own the commits, branches, and deploys at the end of the work.',
    seoTitle: 'Claude Skills for Git and DevOps',
    seoDescription:
      'Git and DevOps skills for AI agents: worktrees, conventional commits, release flows, and finishing a branch cleanly. Installed as local files you can read and edit.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'dev',
    categories: ['ci-cd', 'deployment', 'release-management', 'migrations'],
    pinnedExamples: [
      'obra/using-git-worktrees',
      'github/git-commit',
      'jimliu/release-skills',
      'obra/finishing-a-development-branch',
      'github/conventional-commit',
    ],
  },
  {
    slug: 'planning',
    label: 'Planning and specs',
    icon: 'i-lucide-list-checks',
    userVoice: 'You turn rough ideas into plans, specs, and scoped work.',
    seoTitle: 'Claude Skills for Planning and Specs',
    seoDescription:
      'Planning skills for AI agents: brainstorm an idea, write the spec, record the decision, and hand the agent a plan it can execute. Curated, with the author named on every skill.',
    curatorNote:
      'Plan structural changes with clear domain language, architecture review, tests, debugging, and an executable plan.',
    mergedFrom: 'codebase-architecture',
    audience: 'dev',
    categories: ['planning', 'project-management'],
    pinnedExamples: [
      'obra/brainstorming',
      'n8n-io/spec-driven-development',
      'vercel/adr-skill',
      'obra/writing-plans',
      'obra/executing-plans',
    ],
  },

  // ---------------------------------------------------------------------------
  // Demand test, admitted 2026-08-12. Outside VISION's north-star user.
  // Kept separable so the whole experiment reverses by deleting three rows.
  // ---------------------------------------------------------------------------
  {
    slug: 'seo',
    label: 'SEO',
    icon: 'i-lucide-search',
    userVoice: 'You want the crawler and the model to read the page the same way you do.',
    seoTitle: 'Claude Skills for SEO',
    seoDescription:
      'SEO skills for Claude Code and other agents: technical audits, schema markup, Core Web Vitals, and framework-level SEO. Curated by the author of Nuxt SEO.',
    curatorNote:
      'Technical SEO an agent can actually run: audit the page, fix the schema, check the vitals, and get the framework layer right. Curated by the author of Nuxt SEO.',
    mergedFrom: null,
    audience: 'test',
    categories: [],
    pinnedExamples: [
      // Addy Osmani's, already the anchor of /skills/performance. Pinned in
      // both because it genuinely answers both questions.
      'addyosmani/seo',
      'onmax/nuxt-seo',
      'agricidaniel/seo-technical',
      'coreyhaines31/seo-audit',
      'coreyhaines31/programmatic-seo',
      'coreyhaines31/ai-seo',
      'coreyhaines31/schema-markup',
    ],
    // `aaron-he-zhu/seo-geo-claude-skills` looked like the strongest technical
    // match and even has its own search demand, but both of its skills return
    // 410 from the registry: they were already retired at admission. Restoring
    // them here would silently overrule that call.
  },
  {
    slug: 'marketing',
    label: 'Marketing',
    icon: 'i-lucide-megaphone',
    userVoice: 'You run the campaigns, the copy, and the numbers behind them.',
    seoTitle: 'Claude Skills for Marketing',
    seoDescription:
      'Marketing skills for Claude and other agents: positioning, copy, campaign planning, and lifecycle email. Every skill names its author and links the source file you install.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'test',
    categories: [],
    // Five distinct owners. The first search returned 13 skills from one repo,
    // which would have made this page a mirror of `coreyhaines31/marketingskills`
    // rather than a curated category; widening the query surfaced the rest.
    pinnedExamples: [
      'coreyhaines31/product-marketing',
      'refoundai/content-marketing',
      'kostja94/copywriting',
      'samber/copywriting-hooks',
      'claude-office-skills/email-marketing',
      'coreyhaines31/marketing-plan',
    ],
  },
  {
    slug: 'research',
    label: 'Research',
    icon: 'i-lucide-microscope',
    userVoice: 'You read the literature and keep the evidence straight.',
    seoTitle: 'Claude Skills for Research',
    seoDescription:
      'Research skills for Claude: literature review, scientific writing, and deep web research. Curated skills from named authors and first-party tooling, readable before you run them.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'test',
    categories: [],
    // Academic leads, because that is where the demand is (`claude scientific
    // skills` 390/mo) even though the loudest supply is web-research tooling.
    // Six owners, no repo taking the shortlist.
    // Every key verified 200 against production skilld.dev, not against the
    // local D1, which lags by roughly a month and reports live skills missing.
    pinnedExamples: [
      'anthropics/research-synthesis',
      'k-dense-ai/literature-review',
      'k-dense-ai/scientific-writing',
      'k-dense-ai/citation-management',
      'tavily-ai/tavily-research',
      'langchain-ai/web-research',
      'firecrawl/firecrawl-research-index',
    ],
  },
  {
    slug: 'writing',
    label: 'Writing and docs',
    icon: 'i-lucide-pencil-line',
    userVoice: 'You write the READMEs, PRDs, and updates other people read.',
    seoTitle: 'Claude Skills for Writing',
    seoDescription:
      'Writing skills for Claude and other agents: documentation, READMEs, release notes, and plain technical English. Each skill is a file in a maintainer\'s repo, not a hosted prompt.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'test',
    categories: ['documentation'],
    pinnedExamples: [
      'anthropics/doc-coauthoring',
      'github/documentation-writer',
      'posthog/writing-simplified-technical-english',
      'github/create-readme',
      'anthropics/internal-comms',
    ],
  },
]

export const CLUSTER_BY_SLUG: Map<string, Cluster> = new Map(CLUSTERS.map(c => [c.slug, c]))

/**
 * Categories surfaced via the cluster grid. Used to filter out long-tail
 * categories on the homepage but keep them browseable elsewhere.
 */
export const CLUSTERED_CATEGORIES: Set<string> = new Set(
  CLUSTERS.flatMap(c => c.categories),
)

/**
 * Collections retired into a category on 2026-08-12, as
 * `collection slug -> category slug`. Two collections had no category home and
 * were culled outright rather than merged (`apple-apps`, `knowledge-workspace`:
 * no search demand and too thin to hold a page). Two moved to the existing
 * framework pages instead (`vue-nuxt` -> /frameworks/vue, `react` ->
 * /frameworks/react), which already own those queries.
 */
export const MERGED_COLLECTIONS: Record<string, string> = Object.fromEntries(
  CLUSTERS.filter(c => c.mergedFrom).map(c => [c.mergedFrom!, c.slug]),
)

/**
 * Cluster slugs renamed on 2026-08-12, as `old slug -> new slug`.
 *
 * These are no longer in CLUSTERS, so anything deriving a route allowlist from
 * CLUSTERS would 404 them before nuxt.config's routeRules could 301 them. The
 * skills route policy reads this to let them through to the redirect layer.
 * Keep the redirects in nuxt.config.ts in step with this map.
 */
export const RENAMED_CLUSTER_SLUGS: Record<string, string> = {
  'plan': 'planning',
  'master-agent': 'context-engineering',
  'docs': 'writing',
  'review': 'code-review',
  'debug': 'debugging',
  'ship': 'devops',
}
