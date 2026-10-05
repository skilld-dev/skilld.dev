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
 *
 * 2026-08-13: 16 rows down to 12, so the homepage grid reads as three rows of
 * four rather than a wall. `browser-automation` retired into
 * `context-engineering` and `debugging` into `testing`, because in both cases
 * one track already answered the question. `marketing` and `research` were
 * deleted outright under principle 2: three skills each, both outside the
 * north-star user, and neither earned its page. See RENAMED_CLUSTER_SLUGS and
 * CULLED_CLUSTER_SLUGS for where the four old URLs land.
 *
 * 2026-08-14: the classifier's `design` category split into `interface-design`
 * and `software-design`, because one label covered both "how the screen looks"
 * and "how the system is structured". `/skills/design` promised interface work
 * and listed CQRS and cloud design patterns under it. The 738 rows were
 * reclassified in production with scripts/reclassify-abstractness-category.ts.
 *
 * 2026-08-22: `writing` retired into `anti-slop`. The row kept the
 * `documentation` category and its depth, and its anchor moved to the
 * anti-slop wave: @juampitech's ranked list of ten skills pulled 100K views on
 * X (2026-08-21), more demand evidence than `writing` ever had. Those ten lead
 * as pinnedExamples in the ranked order, one per author. `/skills/writing`
 * and `/skills/docs` 301 here. Anti-slop is dev-facing work: READMEs, docs,
 * and posts written with an agent.
 *
 * 2026-09-04: two rows on measured demand. The same day, `security` merged
 * into `backend-data` (#134), so the taxonomy lands at 14, not 15.
 * `diagrams` is new: it took 10.8% of weighted trending demand and the top
 * skill of the week (tt-a1i/archify), and its skills were scattering across
 * three tracks that promise something else. `research` returns 22 days after
 * it was culled, at 6.5%, led by browser-use. Nothing retired against them,
 * which is a deliberate break with principle 2: a track page answers search
 * demand and costs a URL, while a homepage tile answers trending demand and
 * costs the scarcest space on the site. The grid caps at twelve, so the
 * subtraction happens there. `seo` and `coding` keep their pages and lose
 * their tiles. Method and numbers:
 * ~/scratch/notes/skilld-track-demand-2026-09-04.md
 *
 * 2026-08-25: `anti-slop-coding` joined as the coding counterpart. Its seven
 * pinned skills preserve the shared ranking and keep the page focused. It has
 * no classifier backfill: broad code-review and refactoring results already
 * have a category, and repeating them here would blur the promise.
 *
 * 2026-09-04: `security` retired into `backend-data`. Both tracks already
 * covered auth, and the merge restores the homepage limit of three rows while
 * keeping the two anti-slop tracks separate. `/skills/security` 301s to the
 * combined page.
 */

export interface Cluster {
  slug: string
  label: string
  icon: string
  /** Second person, so the grid reads as "pick yourself", not "pick a task". */
  userVoice: string
  /**
   * How the track reads before "skills" in a board heading: "Design skills devs
   * talked about this week". Lowercase unless it is an acronym. The label is
   * written to stand alone, and "Design and interface work skills" does not.
   */
  noun: string
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
  /**
   * Hand-picked `owner/repo/name` keys that lead cards and detail pages. The
   * repository is part of the key because one owner can ship a Skill of the
   * same name in two repositories, and an `owner/name` pin matched both.
   */
  pinnedExamples: string[]
  /**
   * ISO date the track was admitted, or null for the rows that predate the
   * field. The grid marks a track added inside the last 45 days, so a returning
   * visitor can see the taxonomy moved without reading a changelog.
   */
  addedAt: string | null
}

export const CLUSTERS: Cluster[] = [
  {
    slug: 'design',
    label: 'Design and interface work',
    noun: 'design',
    icon: 'i-lucide-palette',
    userVoice: 'You care how the interface looks, moves, and reads.',
    seoTitle: 'Agent Skills for UI and Design',
    seoDescription:
      'Curated design and UI skills for Claude Code, Cursor, and Codex. Interface feel, motion, accessibility, and component quality, each written by the person who owns that craft.',
    curatorNote:
      'The flagship set for design engineers: interface feel, motion, accessibility, and component quality, plus the testing that proves the work, each skill from the person who owns that craft.',
    mergedFrom: 'design-engineering-essentials',
    audience: 'dev',
    // `interface-design` only, since the 2026-08-13 classifier split. The
    // architecture half of the old `design` label moved to `planning`, where
    // "turn rough ideas into plans and specs" already lives.
    categories: ['interface-design'],
    addedAt: null,
    pinnedExamples: [
      'emilkowalski/skills/emil-design-eng',
      'jakubkrehel/make-interfaces-feel-better/make-interfaces-feel-better',
      'pbakaus/impeccable/impeccable',
      'vercel-labs/agent-skills/web-design-guidelines',
      'ibelick/ui-skills/fixing-motion-performance',
      'ibelick/ui-skills/fixing-accessibility',
      'ibelick/ui-skills/baseline-ui',
      'nutlope/hallmark/hallmark',
      'shadcn/ui/shadcn',
    ],
  },
  {
    slug: 'coding',
    label: 'Everyday coding',
    noun: 'coding',
    icon: 'i-lucide-code',
    userVoice: 'You want the handful of skills that earn their context on every project.',
    seoTitle: 'Agent Skills for Coding',
    seoDescription:
      'The coding skills worth installing first, curated for Claude Code, Cursor, and Codex. Plan, verify, debug, test, and model a domain, every skill from a maintainer you can read before you run it.',
    curatorNote:
      'Cross-stack first installs that work in any agent: plan, verify, debug, test, and a design baseline. Every skill is a context tax; these are the ones that earn it.',
    mergedFrom: 'essentials',
    audience: 'dev',
    categories: ['framework', 'rendering'],
    addedAt: null,
    pinnedExamples: [
      'vercel-labs/skills/find-skills',
      'othmanadi/planning-with-files/planning-with-files',
      'mattpocock/skills/grill-me',
      'obra/superpowers/systematic-debugging',
      'mattpocock/skills/tdd',
      'mattpocock/skills/improve-codebase-architecture',
      'mattpocock/skills/domain-modeling',
      'anthropics/skills/frontend-design',
    ],
  },
  {
    slug: 'anti-slop-coding',
    label: 'Anti-slop coding',
    noun: 'anti-slop coding',
    icon: 'i-lucide-eraser',
    userVoice: 'You want agent-written code cleaned before it reaches review.',
    seoTitle: 'Agent Skills for Anti-Slop Coding',
    seoDescription:
      'Anti-slop coding skills for Claude Code, Cursor, and Codex. Review and remove AI-generated code slop without changing behavior, using seven ranked skills from their authors.',
    curatorNote:
      'Seven skills for reviewing and removing AI-generated code slop, kept in the order shared in the anti-slop coding list from August 2026.',
    mergedFrom: null,
    audience: 'dev',
    categories: [],
    addedAt: null,
    pinnedExamples: [
      'dmmulroy/anti-slop/install-anti-slop',
      'cursor/plugins/thermo-nuclear-code-quality-review',
      'brianlovin/claude-config/deslop',
      'cursor/plugins/deslop',
      'davila7/claude-code-templates/deslop',
      // Registry identity follows `docs/SKILL.md`; its frontmatter name
      // (`desloppify`) renders as the display name.
      'peteromallet/desloppify/docs',
      'asyrafhussin/agent-skills/code-slop',
    ],
  },
  {
    slug: 'context-engineering',
    label: 'Agent workflows',
    noun: 'agent workflow',
    icon: 'i-lucide-zap',
    userVoice: 'You run agents in parallel, drive a browser, and verify what they hand back.',
    seoTitle: 'Agent Skills for Context Engineering',
    seoDescription:
      'Context engineering skills for agent workflows: delegate to subagents, run passes in parallel, drive a real browser, and verify before completion. Works with Claude Code, Cursor, and Codex.',
    curatorNote:
      'Run multi-pass changes with focused delegation, parallel work, browser control, and verification, then build the skill you were missing.',
    mergedFrom: 'agent-workflow',
    audience: 'dev',
    // `scraping` moved to `research` on 2026-09-04. Values may not repeat.
    categories: ['automation'],
    addedAt: null,
    pinnedExamples: [
      'obra/superpowers/subagent-driven-development',
      'obra/superpowers/dispatching-parallel-agents',
      'obra/superpowers/verification-before-completion',
      'mattpocock/skills/handoff',
      'obra/superpowers/executing-plans',
      'anthropics/skills/skill-creator',
      'obra/superpowers/writing-skills',
      'openai/skills/skill-installer',
      'callstackincubator/agent-skills/validate-skills',
      'anthropics/skills/mcp-builder',
      // Browser control retired into this category on 2026-08-13: driving a
      // browser is what an agent does inside a workflow, not a track someone
      // picks. `/skills/browser-automation` 301s here.
      'microsoft/playwright-cli/playwright-cli',
      'vercel-labs/agent-browser/agent-browser',
      'browser-use/browser-use/browser-use',
      'firecrawl/cli/firecrawl-cli',
    ],
  },
  {
    slug: 'code-review',
    label: 'Review and refactoring',
    noun: 'review and refactoring',
    icon: 'i-lucide-eye',
    userVoice: 'You read other devs\' code and reshape it without breaking it.',
    seoTitle: 'Agent Skills for Code Review',
    seoDescription:
      'Code review and refactoring skills for AI agents. Turn review comments, bot findings, and production issues into fixed code, with skills written by maintainers who review for a living.',
    curatorNote:
      'Turn review comments, bot findings, and production issues into fixed code.',
    mergedFrom: 'code-review',
    audience: 'dev',
    categories: ['code-review', 'refactoring'],
    addedAt: null,
    pinnedExamples: [
      'pbakaus/agent-reviews/resolve-agent-reviews',
      'obra/superpowers/requesting-code-review',
      'obra/superpowers/receiving-code-review',
      'brianlovin/claude-config/fix-sentry-issues',
      'dimillian/skills/review-and-simplify-changes',
      'github/awesome-copilot/refactor',
    ],
  },
  {
    slug: 'testing',
    label: 'Testing and debugging',
    noun: 'testing and debugging',
    icon: 'i-lucide-flask-conical',
    userVoice: 'You want tests that prove the change, and a cause when it breaks.',
    seoTitle: 'Agent Skills for Testing and Debugging',
    seoDescription:
      'Testing and debugging skills for Claude Code and other agents: test-driven development, coverage assessment, webapp testing, systematic debugging, and the post-mortem after an incident.',
    curatorNote: null,
    // Debugging retired into this category on 2026-08-13: it held two skills,
    // and a failing test is where debugging starts. `/skills/debugging` 301s
    // here.
    mergedFrom: null,
    audience: 'dev',
    categories: ['testing', 'incident-response', 'observability'],
    addedAt: null,
    pinnedExamples: [
      'mattpocock/skills/tdd',
      'obra/superpowers/test-driven-development',
      'obra/superpowers/systematic-debugging',
      'bitwarden/ai-plugins/assessing-test-coverage',
      'wdm0006/python-skills/verifying-external-behavior',
      'anthropics/skills/webapp-testing',
      'deanpeters/product-manager-skills/autonomous-investigation',
      'boshu2/agentops/post-mortem',
    ],
  },
  {
    slug: 'performance',
    label: 'Performance and web quality',
    noun: 'performance',
    icon: 'i-lucide-gauge',
    userVoice: 'You profile the slow path before you ship it.',
    seoTitle: 'Agent Skills for Web Performance',
    seoDescription:
      'Performance and web quality skills for agents: Core Web Vitals, performance audits, accessibility, and the checks that run before you ship. Includes Addy Osmani\'s web quality suite.',
    curatorNote:
      'Addy Osmani\'s web quality suite: performance audits, Core Web Vitals, accessibility, SEO, and best practices before you ship.',
    mergedFrom: 'web-quality',
    audience: 'dev',
    categories: ['performance'],
    addedAt: null,
    pinnedExamples: [
      'addyosmani/web-quality-skills/web-quality-audit',
      'addyosmani/web-quality-skills/core-web-vitals',
      'addyosmani/web-quality-skills/performance',
      'addyosmani/web-quality-skills/accessibility',
      'addyosmani/web-quality-skills/seo',
      'addyosmani/web-quality-skills/best-practices',
      'millionco/react-doctor/react-doctor',
    ],
  },
  {
    slug: 'backend-data',
    label: 'Backend, data, and security',
    noun: 'backend and security',
    icon: 'i-lucide-database',
    userVoice: 'You wire up databases, auth, security, and realtime systems.',
    seoTitle: 'Agent Skills for Backend, Databases, and Security',
    seoDescription:
      'Backend, database, and security skills for agents: data modelling, auth patterns, threat modelling, integrity audits, and realtime systems.',
    curatorNote:
      'Backend skills for agents wiring up databases, auth, security, and realtime systems, with guidance from the teams and devs who build them.',
    mergedFrom: 'backend-data',
    audience: 'dev',
    categories: ['data-modeling', 'security', 'auth'],
    addedAt: null,
    pinnedExamples: [
      'supabase/agent-skills/supabase-postgres-best-practices',
      'stripe/ai/stripe-best-practices',
      'get-convex/agent-skills/convex-quickstart',
      'firebase/agent-skills/firebase-basics',
      'resend/resend-skills/resend',
      'wshobson/agents/stride-analysis-patterns',
      'github/awesome-copilot/audit-integrity',
      'bitwarden/ai-plugins/bitwarden-security-context',
      'wshobson/agents/auth-implementation-patterns',
      'better-auth/skills/best-practices',
    ],
  },
  {
    slug: 'devops',
    label: 'Shipping and release',
    noun: 'shipping and release',
    icon: 'i-lucide-git-branch',
    userVoice: 'You own the commits, branches, and deploys at the end of the work.',
    seoTitle: 'Agent Skills for Git and DevOps',
    seoDescription:
      'Git and DevOps skills for AI agents: worktrees, conventional commits, release flows, and finishing a branch cleanly. Installed as local files you can read and edit.',
    curatorNote: null,
    mergedFrom: null,
    audience: 'dev',
    categories: ['ci-cd', 'deployment', 'release-management', 'migrations'],
    addedAt: null,
    pinnedExamples: [
      'obra/superpowers/using-git-worktrees',
      'github/awesome-copilot/git-commit',
      'jimliu/baoyu-skills/release-skills',
      'obra/superpowers/finishing-a-development-branch',
      'github/awesome-copilot/conventional-commit',
    ],
  },
  {
    slug: 'planning',
    label: 'Planning and specs',
    noun: 'planning',
    icon: 'i-lucide-list-checks',
    userVoice: 'You turn rough ideas into plans, specs, and scoped work.',
    seoTitle: 'Agent Skills for Planning and Specs',
    seoDescription:
      'Planning skills for AI agents: brainstorm an idea, write the spec, record the decision, and hand the agent a plan it can execute. Curated, with the author named on every skill.',
    curatorNote:
      'Plan structural changes with clear domain language, architecture review, tests, debugging, and an executable plan.',
    mergedFrom: 'codebase-architecture',
    audience: 'dev',
    categories: ['planning', 'project-management', 'software-design'],
    addedAt: null,
    pinnedExamples: [
      'obra/superpowers/brainstorming',
      'n8n-io/n8n/spec-driven-development',
      'vercel/ai/adr-skill',
      'obra/superpowers/writing-plans',
      'obra/superpowers/executing-plans',
    ],
  },

  {
    slug: 'anti-slop',
    label: 'Anti-slop writing',
    noun: 'anti-slop writing',
    icon: 'i-lucide-eraser',
    userVoice: 'You want prose that reads like a person wrote it, with the AI tells gone.',
    seoTitle: 'Agent Skills for Anti-Slop Writing',
    seoDescription:
      'Anti-slop skills for Claude Code, Cursor, and Codex: strip AI writing tells from prose while keeping your voice. Ten ranked skills, each from the person who wrote it.',
    curatorNote:
      'Ten skills that remove AI writing tells while keeping the author\'s voice, one per author, ordered after the anti-slop rank @juampitech shared on X in August 2026.',
    mergedFrom: null,
    audience: 'dev',
    // Inherited from `writing` when it retired into this row: the
    // documentation backfill gives the page depth under the ten ranked leads.
    categories: ['documentation'],
    addedAt: null,
    pinnedExamples: [
      'hardikpandya/stop-slop/stop-slop',
      'petergyang/no-ai-slop/no-ai-slop',
      'blader/humanizer/humanizer',
      'cursor/plugins/unslop',
      'ehmo/slopkit/slopbeth',
      'Aboudjem/humanizer-skill/humanizer',
      'stephenturner/skill-deslop/deslop',
      'elithrar/dotfiles/anti-slop',
      // Registry name is the repo slug; the skill's frontmatter name
      // (`humanize`) renders as its display name.
      'aashaexo/soundshuman/soundshuman',
      'jalaalrd/anti-ai-slop-writing/anti-ai-slop-writing',
    ],
  },

  {
    slug: 'diagrams',
    label: 'Diagrams and codebase maps',
    noun: 'diagram',
    icon: 'i-lucide-workflow',
    userVoice: 'You need the system drawn before you can change it.',
    seoTitle: 'Agent Skills for Diagrams and Architecture Maps',
    seoDescription:
      'Diagram and codebase-map skills for Claude Code, Cursor, and Codex. Draw architecture, data flow, and pull requests as pictures, from the maintainers who wrote the tools.',
    // No "trending this week" claim here. The note renders under the curator's
    // name on the page and would be wrong within a month.
    curatorNote:
      'Skills that draw the system: architecture and data flow, a map of a codebase you have not read, and the shape of a pull request.',
    mergedFrom: null,
    audience: 'dev',
    // `diagramming` was added to the classifier on 2026-09-04 for this track.
    // Pins lead; the category is the backfill under them.
    categories: ['diagramming'],
    addedAt: '2026-09-04',
    pinnedExamples: [
      'tt-a1i/archify/archify',
      'garrytan/gstack/diagram',
      'kingbootoshi/cartographer/cartographer',
      'coldteadotai/pr-lens/pr-lens',
      'github/awesome-copilot/architecture-blueprint-generator',
      'github/awesome-copilot/excalidraw-diagram-generator',
      'cathrynlavery/diagram-design/diagram-design',
      'humanlayer/skills/show-me',
      'kepano/obsidian-skills/json-canvas',
    ],
  },
  {
    slug: 'research',
    label: 'Research and web content',
    noun: 'research',
    icon: 'i-lucide-telescope',
    userVoice: 'You send the agent out to read the web and bring back sources.',
    seoTitle: 'Agent Skills for Research and Web Scraping',
    seoDescription:
      'Research and scraping skills for Claude Code, Cursor, and Codex. Drive a browser, pull a page down to clean text, and come back with sources you can check.',
    curatorNote:
      'Send the agent out and get sources back: browser control, scraping, deep research passes, and turning a page or a document into text an agent can read.',
    mergedFrom: null,
    audience: 'dev',
    categories: ['scraping'],
    addedAt: '2026-09-04',
    pinnedExamples: [
      'browser-use/browser-use/browser-use',
      'mattpocock/skills/research',
      'mvanhorn/last30days-skill/last30days',
      'kepano/obsidian-skills/defuddle',
      'firecrawl/anydoc/convert-documents-to-markdown',
      'garrytan/gstack/scrape',
      'bytedance/deer-flow/github-deep-research',
      'imbad0202/academic-research-skills/deep-research',
    ],
  },

  // ---------------------------------------------------------------------------
  // Demand test, admitted 2026-08-12. Outside VISION's north-star user.
  // Kept separable so the whole experiment reverses by deleting the row.
  // ---------------------------------------------------------------------------
  {
    slug: 'seo',
    label: 'SEO',
    noun: 'SEO',
    icon: 'i-lucide-search',
    userVoice: 'You want the crawler and the model to read the page the same way you do.',
    seoTitle: 'Agent Skills for SEO',
    seoDescription:
      'SEO skills for Claude Code and other agents: technical audits, schema markup, Core Web Vitals, and framework-level SEO. Curated by the author of Nuxt SEO.',
    curatorNote:
      'Technical SEO an agent can actually run: audit the page, fix the schema, check the vitals, and get the framework layer right. Curated by the author of Nuxt SEO.',
    mergedFrom: null,
    audience: 'test',
    categories: [],
    addedAt: null,
    pinnedExamples: [
      // Addy Osmani's, already the anchor of /skills/performance. Pinned in
      // both because it genuinely answers both questions.
      'addyosmani/web-quality-skills/seo',
      'onmax/nuxt-skills/nuxt-seo',
      'agricidaniel/claude-seo/seo-technical',
      'agricidaniel/claude-seo/seo-schema',
      'agricidaniel/claude-seo/seo-programmatic',
      'agricidaniel/claude-seo/seo-sitemap',
      'coreyhaines31/marketingskills/seo-audit',
      'coreyhaines31/marketingskills/programmatic-seo',
      'coreyhaines31/marketingskills/ai-seo',
      'coreyhaines31/marketingskills/schema-markup',
    ],
    // `aaron-he-zhu/seo-geo-claude-skills` looked like the strongest technical
    // match and even has its own search demand, but both of its skills return
    // 410 from the registry: they were already retired at admission. Restoring
    // them here would silently overrule that call.
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
 * `apple-apps` and `knowledge-workspace` stayed live until 2026-09-30, when they
 * were retired to 410 (shared/retired-collections.ts). They had been kept because:
 * their skills had no category or framework page to land on, and retiring a
 * collection removes the `curator_reason` trust signal from everything in it.
 *
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
/**
 * Every pinned `owner/repo/name` key across all categories.
 *
 * One definition, because three things read it: the cluster queries, the
 * indexability recompute (a pin is a primary trust signal), and the skills
 * sitemap. If these drifted apart, a skill could be curated onto a page and
 * still be excluded from the index.
 */
/**
 * Curated picks on the `/frameworks/*` pages.
 *
 * These are not categories, so they have no row in CLUSTERS, but they are
 * curated surfaces in exactly the same sense: a human chose each skill to lead
 * the page. The `vue-nuxt` and `react` collections retired into them on
 * 2026-08-12, and `curator_reason_count` stops counting a collection the moment
 * it is soft-deleted, so without this the retirement would have deindexed all
 * fourteen while the pages that feature them stayed live.
 */
export const FRAMEWORK_PINNED_SKILLS: string[] = [
  // /frameworks/vue and /frameworks/nuxt
  'vuejs-ai/skills/vue-best-practices',
  'vuejs-ai/skills/vue-testing-best-practices',
  'onmax/nuxt-skills/nuxt',
  'antfu/skills/vue',
  'antfu/skills/pinia',
  'nuxt/ui/nuxt-ui',
  'vueuse/skills/vueuse-functions',
  'harlan-zw/harlan-agent-kit/nuxt-frontend-design',
  'harlan-zw/harlan-agent-kit/nuxt-frontend-review',
  // /frameworks/react and /frameworks/nextjs
  'vercel-labs/agent-skills/react-best-practices',
  'vercel-labs/agent-skills/composition-patterns',
  'vercel-labs/vercel-plugin/nextjs',
  'deckardger/tanstack-agent-skills/tanstack-query',
  'vercel/next.js/next-cache-components-optimizer',
]

export const PINNED_SKILL_KEYS: Set<string> = new Set([
  ...CLUSTERS.flatMap(cluster => cluster.pinnedExamples),
  ...FRAMEWORK_PINNED_SKILLS,
])

export function isCategoryPinned(owner: string, repo: string, name: string): boolean {
  return PINNED_SKILL_KEYS.has(`${owner}/${repo}/${name}`)
}

export const RENAMED_CLUSTER_SLUGS: Record<string, string> = {
  'plan': 'planning',
  'master-agent': 'context-engineering',
  // `docs` -> `writing` was the 2026-08-12 rename. `writing` retired into
  // `anti-slop` on 2026-08-22, so the old slug points at the live target
  // rather than 301ing into a second 301.
  'docs': 'anti-slop',
  'review': 'code-review',
  // `debug` -> `debugging` was the 2026-08-12 rename. `debugging` merged into
  // `testing` on 2026-08-13, so the old slug points at the live target rather
  // than 301ing into a second 301.
  'debug': 'testing',
  'debugging': 'testing',
  'browser-automation': 'context-engineering',
  'ship': 'devops',
  // `writing` retired into `anti-slop` on 2026-08-22; the anti-slop anchor
  // replaced it with the same audience and the same category depth.
  'writing': 'anti-slop',
  // Both tracks covered auth. The combined route keeps their full depth.
  'security': 'backend-data',
}

/**
 * Categories deleted on 2026-08-13 with no successor, as slugs.
 *
 * `marketing` and `research` were the weakest rows of the 2026-08-12 demand
 * test: three skills each, two and three authors, and both outside VISION's
 * north-star user. They have no category that answers the same question, so
 * they 301 to `/skills` rather than to a category that would mislead.
 * The route policy reads this so the old paths reach the redirect layer.
 *
 * 2026-09-04: `research` came off this list. It was culled on no evidence and
 * came back with some: 6.5% of weighted trending demand, led by browser-use at
 * rank 6 for the week. Its 301 in nuxt.config.ts went with it.
 */
export const CULLED_CLUSTER_SLUGS: string[] = ['marketing']
