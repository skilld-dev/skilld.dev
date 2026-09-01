import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dependencyPluginCompat } from './scripts/lib/dependency-plugin-compat'
import { withBuildAssetMissFallthrough } from './scripts/lib/static-asset-fallthrough'
import { SENTRY_DSN, sentryRelease, sentryReportingEnabled } from './shared/sentry'

const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN)
  || existsSync('.env.sentry-build-plugin')

export default defineNuxtConfig({
  extends: ['./layers/admin', './layers/artifact-delivery', './layers/identity', './layers/registry', './layers/marketing', './layers/mcp'],

  hooks: {
    'nitro:config': (nitroConfig) => {
      // Cloudflare serves existing files before the Worker. Let misses enter
      // Nitro so its build-asset route can return a non-cacheable 404.
      nitroConfig.publicAssets = withBuildAssetMissFallthrough(
        nitroConfig.publicAssets || [],
        '/_nuxt/v2/',
      )
    },
    // 2026-08-22 agent lane (GOOGLE_RECOVERY.md): list the agent-only sitemap
    // in llms.txt. The module's `notes` config exists but never renders, so
    // this pushes a link into the first section instead.
    'ai-ready:llms-txt': (payload: { sections?: { links?: { title: string, href: string, description?: string }[] }[], notes: string[] }) => {
      const section = payload.sections?.[0]
      if (!section)
        return
      section.links ??= []
      if (!section.links.some(l => l.href.includes('/ai-sitemap.xml'))) {
        section.links.push({
          title: 'AI sitemap',
          href: 'https://skilld.dev/ai-sitemap.xml',
          description: 'Every AI-ready page, including pages that are noindex for Google.',
        })
      }
    },
  },

  nuxtDx: {
    report: true,
    sizeBudget: {
      overridesKb: { 'server/plugins/sentry.ts': 326 },
    },
  },

  modules: [
    '@harlan-zw/nuxt-cf-jobs',
    '@harlan-zw/nuxt-cloudflare',
    '@harlan-zw/nuxt-dx',
    '@harlan-zw/nuxt-use-query',
    '@harlan-zw/nuxt-wide-events',
    './modules/mdxg/src/module',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxt/scripts',
    '@nuxtjs/seo',
    'nuxt-ai-ready',
    '@nuxtjs/mcp-toolkit',
    '@nuxt/a11y',
    '@nuxtjs/html-validator',
    'motion-v/nuxt',
    '@vueuse/nuxt',
    'nuxt-auth-utils',
    '@sentry/nuxt/module',
    'nuxt-skew-protection',
  ],

  nuxtCloudflare: {
    kvCache: { binding: 'KV_CACHE' },
  },

  wideEvents: {
    request: true,
    service: 'skilld',
    fields: [
      'attempt',
      'batch.count',
      'cache.readFailed',
      'cache.writeFailed',
      'eligible.count',
      'error.count',
      'failed.count',
      'item.count',
      'operation',
      'outcome',
      'processed.count',
      'rateLimit.limit',
      'rateLimit.remaining',
      // An outcome says a branch fired; these say which one and on what. A
      // discovery row parked with `outcome: 'unknown'` and nothing else was
      // indistinguishable from every other parked row in the archive.
      'reason',
      'repo',
      'scanned.count',
      'success.count',
      'truncated',
      'upstream.status',
    ],
  },

  cfJobs: {
    // Discover each layer's server/tasks directory. Cron expressions live with
    // their handlers; the module derives Nitro task registration, scheduling,
    // and Cloudflare triggers from that single source of truth.
    tasksDir: true,
    scheduledTasks: process.env.NODE_ENV === 'production',
    reconcile: {
      d1Binding: 'DB',
      staleSeconds: 20 * 60,
      orphanedSeconds: 2 * 60,
      orphanedBatchSeconds: 24 * 60 * 60,
      limit: 100,
    },
    queues: {
      'repo-sync': {
        binding: 'REPO_SYNC_QUEUE',
        queueName: 'skilld-repo-sync',
        maxBatchSize: 1,
        maxBatchTimeout: 1,
        maxConcurrency: 1,
        maxRetries: 3,
        retryDelay: 60,
        deadLetterQueue: 'skilld-repo-sync-dlq',
        deadLetterQueueBinding: 'REPO_SYNC_DLQ',
      },
      'repo-review-sync': {
        binding: 'REPO_REVIEW_SYNC_QUEUE',
        queueName: 'skilld-repo-review-sync',
        maxBatchSize: 1,
        maxBatchTimeout: 1,
        maxConcurrency: 5,
        maxRetries: 3,
        retryDelay: 60,
        deadLetterQueue: 'skilld-repo-sync-dlq',
        deadLetterQueueBinding: 'REPO_SYNC_DLQ',
      },
      'repo-sync-dlq': {
        binding: 'REPO_SYNC_DLQ',
        queueName: 'skilld-repo-sync-dlq',
        maxBatchSize: 1,
        maxBatchTimeout: 1,
        maxConcurrency: 1,
        maxRetries: 3,
        retryDelay: 60,
      },
    },
    wranglerPath: 'wrangler.jsonc',
  },

  // Version skew protection: after a deploy, clients still running the previous
  // build fetch old hashed chunks. Instead of 404ing (Sentry SKILLD-4), prior
  // builds' assets are retained (default `fs` storage under
  // node_modules/.cache/nuxt-seo) and bundled into the new deployment so the
  // Worker serves them as static assets. CI persists that cache dir across
  // deploys via actions/cache (see deploy-cloudflare.yml). Mirrors
  // nuxtseo.com/apps/site (same cloudflare-module preset). cloudflare-module has
  // no WebSocket support (that needs cloudflare-durable), so updates poll.
  skewProtection: {
    // Keep runtime endpoints at the root. The nested `/v2/` asset namespace is
    // a cache generation, not an application mount point.
    basePath: '/__skew',
    updateStrategy: 'polling',
    // Silently reload to the new build when the user goes idle rather than
    // showing a prompt (which would need a <SkewNotification/> on the anonymous
    // SEO surface). Old assets are served meanwhile, so nothing 404s regardless.
    reloadStrategy: 'idle',
    // Retention is left at the module defaults, 30 days and 10 versions,
    // pruned by whichever binds first.
    //
    // This used to pin `maxNumberOfVersions: 3` to keep obsolete assets out of
    // the Worker upload. That made the retention window depend on deploy rate
    // rather than on time, and it degraded exactly when it mattered most:
    // measured on 2026-08-19, two deploys landed four minutes apart, so a
    // three-version window can be spent in minutes during a push session.
    // A guarantee a cache needs to reason about has to be denominated in the
    // same unit the cache is, which is seconds.
    //
    // `htmlCache` is deliberately not on yet. It would publish the retention
    // guarantee to `@harlan-zw/nuxt-cloudflare` and drop the version cookie
    // from any document a shared cache was asked to keep, but no HTML route
    // here asks: `app.vue` calls `useAuth()`, so the rendered shell varies by
    // sign-in state, and shared caches key on the URL without varying on
    // Cookie. Making the shell user-independent comes first; only then do the
    // `/gh/**` pages earn a rule.
  },

  scripts: {
    registry: {
      cloudflareWebAnalytics: {
        token: 'fefd4b7eafe04d5f81621e43e5d5ef80',
        trigger: 'server',
      },
    },
  },

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  site: {
    url: 'https://skilld.dev',
    name: 'skilld',
    description: 'Curated agent skills by humans, written by real maintainers in their own GitHub repos',
    // Middle dot (U+00B7): a small, vertically centred separator for the title
    // template ('Page · skilld'), replacing unhead's default pipe. Matches the
    // separator the homepage already hardcodes.
    titleSeparator: '·',
  },

  aiReady: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
    cron: false,
    runtimeSync: true,
    // llms.txt is an index, not a dump: each entry links the page's .md.
    // The 28.5 MB llms-full.txt inline dump is retired below (routeRules).
    // GOOGLE_RECOVERY.md, agent lane rework.
    llmsTxt: {
      markdownLinks: true,
    },
    mcp: {
      tools: false,
      resources: false,
    },
    mcpServerCard: {
      name: 'dev.skilld/registry',
      title: 'skilld.dev discovery',
      description: 'Search curated agent skills and return run or install commands.',
      websiteUrl: 'https://skilld.dev',
    },
    agentSkills: {
      skills: [{
        source: 'local',
        name: 'skilld-registry',
        description: 'Search skilld.dev and return verified commands to run or install a skill.',
        file: './skills/skilld-registry/SKILL.md',
      }],
    },
  },

  mcp: {
    route: '/api/mcp',
    name: 'skilld.dev discovery',
    version: '1.0.0',
    description: 'Discover curated agent skills with provenance and a safe run or install command handoff.',
    instructions: 'Search first, inspect provenance before recommending a skill, then return the run command for the user to approve and run. Offer the install command only when the user wants the skill in every session. This server never runs or installs anything.',
    sessions: false,
    browserRedirect: '/',
  },

  app: {
    buildAssetsDir: '/_nuxt/v2/',
    head: {
      meta: [
        { 'http-equiv': 'origin-trial', 'content': 'Auy85A/20M9GxT7GTSdCadWBhdADJXRmviBX/6dWjyQKWCCDVntG9PObBqShEmvEeMeRudWz7MyZf7y9SkaZMAwAAABKeyJvcmlnaW4iOiJodHRwczovL3NraWxsZC5kZXY6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0=' },
      ],
      link: [
        // Explicit `sizes` on both: without it, browsers/crawlers see two
        // `rel="icon"` links both implicitly claiming "any" size, and pick
        // between them arbitrarily. The SVG genuinely scales to any size; the
        // .ico is a fixed multi-size bitmap, so it declares what it contains.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      ],
    },
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  runtimeConfig: {
    sessionPassword: '',
    adminSecret: '',
    tokenKey: '',
    healthCheckNotifyTo: 'harlan@harlanzw.com',
    publicSiteUrl: 'https://skilld.dev',
    oauth: {
      github: {
        clientId: '',
        clientSecret: '',
        scope: ['read:user', 'user:email'],
      },
    },
    email: {
      from: {
        name: 'skilld',
        email: 'noreply@mail.skilld.dev',
      },
    },
    sentry: {
      dsn: SENTRY_DSN,
      // Production bundles are also built for local Wrangler verification.
      // Only CI creates a deployable build, so local previews must not report
      // into the paid production project.
      enabled: sentryReportingEnabled({ nodeEnv: process.env.NODE_ENV, ci: process.env.CI }),
      environment: 'production',
      release: sentryRelease() ?? '',
      tracesSampleRate: 0.05,
    },
    public: {
      algolia: {
        appId: 'OFCNCOG2CU',
        apiKey: 'f54e21fa3a2a0160595bb058179bfb1e',
        indexName: 'npm-search',
      },
    },
  },

  nitro: {
    preset: 'cloudflare-module',
    // Registered here, not scanned from `server/middleware`, because nuxt-ai-ready
    // claims every `.md` path and scanned middleware runs after a module's.
    handlers: [
      { middleware: true, handler: '~~/server/handlers/skill-md-probe.ts' },
    ],
    alias: {
      // Cloudflare's ASSETS binding is authoritative in production and local
      // Wrangler preview. Avoid parsing Nitro's per-file public asset table in
      // every new isolate.
      '#nitro-internal-virtual/public-assets-data': fileURLToPath(
        new URL('./server/runtime/cloudflare-public-assets.ts', import.meta.url),
      ),
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
    storage: {
      data: {
        driver: 'cloudflare-kv-binding',
        binding: 'KV_DATA',
      },
    },
    experimental: {
      tasks: true,
      wasm: true,
      asyncContext: true,
    },
  },

  ogImage: {
    security: {
      // Production gets its stable key from NUXT_OG_IMAGE_SECRET. A fixed,
      // non-sensitive local key keeps signed dev URLs valid across HMR builds.
      secret: process.env.NUXT_OG_IMAGE_SECRET
        || (process.env.NODE_ENV === 'development' ? 'skilld-local-development' : undefined),
    },
  },

  // SWR caching only kicks in for production builds; in dev every request
  // re-renders so HMR isn't fighting a stale cached HTML/JSON response.
  // SWR disabled: stale-while-revalidate kept serving stale content after deploys
  // and D1 ingests (per-colo, up to the TTL) — including once serving a crashing
  // render — which caused repeated confusion. Pages now render dynamically (SSR +
  // D1 per request), always fresh. D1 reads are cheap at current traffic; re-add
  // targeted caching here if/when traffic warrants it.
  routeRules: {
    // Cache policy, expressed where Nuxt already puts freshness.
    //
    // This used to live in `server/plugins/cache-policy.ts` as an allowlist
    // matched against regexes, because `@harlan-zw/nuxt-cloudflare` overwrote
    // any header a route rule set. It no longer does: the module honours an
    // app-set policy and only overrides on a proven hazard, so the rules can
    // say what they mean.
    //
    // Two headers on purpose. `cloudflare-cdn-cache-control` sets the shared
    // lifetime and Cloudflare strips it downstream; `cache-control` is what the
    // browser sees. Where only the edge should cache, the browser gets the
    // no-store default from the module and only the edge header appears here.
    '/api/collections': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } } as any,
    '/api/collections/featured': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } } as any,
    '/api/community': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } } as any,
    '/api/feed/recent-updates': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } } as any,
    '/api/feed/recent-publishes': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=60' } } as any,
    '/api/skills/tags': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=300' } } as any,
    // Search and browse. The Workers Cache key includes the query string, so
    // each distinct query caches separately. Nothing here varies by user.
    '/api/skills': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=120, stale-while-revalidate=600, stale-if-error=3600' } } as any,
    '/api/clusters': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=600' } } as any,
    '/api/clusters/*': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=300' } } as any,
    '/api/orgs/*': {
      headers: {
        'cache-control': 'private, no-store',
        'cloudflare-cdn-cache-control': 'private, no-store',
      },
    } as any,
    '/api/tags/*': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=300' } } as any,
    // Raw markdown and the typeahead index deliberately keep browser caching
    // too: both are large, identical for everyone, and only change when the
    // registry does.
    '/api/skills-raw/**': {
      headers: {
        'cache-control': 'public, max-age=300',
        'cloudflare-cdn-cache-control': 'public, max-age=300',
      },
    } as any,
    '/api/skills/typeahead': {
      headers: {
        'cache-control': 'public, max-age=3600',
        'cloudflare-cdn-cache-control': 'public, max-age=3600, stale-while-revalidate=86400, stale-if-error=86400',
      },
    } as any,
    '/api/skill-live/**': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=3600, stale-while-revalidate=86400, stale-if-error=86400' } } as any,
    // The old rule was `/api/repos/(?!index/)owner/repo`. Most-specific-wins
    // replaces the negative lookahead: the index routes take the second rule.
    '/api/repos/**': { headers: { 'cloudflare-cdn-cache-control': 'public, max-age=900, stale-while-revalidate=3600, stale-if-error=3600' } } as any,
    '/api/repos/*/*/route-target': {
      headers: {
        'cache-control': 'private, no-store',
        'cloudflare-cdn-cache-control': 'private, no-store',
      },
    } as any,
    '/api/repos/index/**': {
      headers: {
        'cache-control': 'private, no-store',
        'cloudflare-cdn-cache-control': 'private, no-store',
      },
    } as any,
    '/collections': { redirect: { to: '/community', statusCode: 301 } } as any,
    // 2026-08-22: `_WeeklyBand.vue` and `_FrameworkSkillsDirectory.vue` were
    // component files living inside pages/ dirs, so Nuxt made them routes:
    // empty shells, indexable, listed in the sitemap. The components moved to
    // components/ dirs; these catch any URL Google already crawled.
    '/_WeeklyBand': { redirect: { to: '/', statusCode: 301 } } as any,
    '/frameworks/_FrameworkSkillsDirectory': { redirect: { to: '/frameworks/vue', statusCode: 301 } } as any,
    // 2026-09-01: same shape. `_GithubBadgePreview.vue` sits beside the brand
    // kit page and Nuxt made it a route. The page went indexable today, so the
    // empty sibling redirects instead of shipping next to it.
    '/brand-kit/_GithubBadgePreview': { redirect: { to: '/brand-kit/github-badge', statusCode: 301 } } as any,
    // 2026-08-22: llms-full.txt inlined every page's markdown into one 28.5 MB
    // file; agents truncate or time out on it. llms.txt now links each page's
    // .md (aiReady.llmsTxt.markdownLinks), so the dump redirects there. 302 so
    // this reverses the moment per-section splitting is worth building.
    '/llms-full.txt': { redirect: { to: '/llms.txt', statusCode: 302 } } as any,
    // `/gh` has no index page: owner hubs live at `/gh/<owner>`. It 404'd while
    // `/orgs` 301'd straight into it, so every legacy orgs-index link dead-ended
    // on a redirect chain. `/community` is the browsable owner surface.
    '/gh': { redirect: { to: '/community', statusCode: 301 } } as any,
    // Never a route here, but linked as one: atstore.fyi points at `/explore`
    // with the anchor "Explore", and it is the only dofollow inbound link from
    // a ranked domain. `/skills` is what that link was reaching for.
    '/explore': { redirect: { to: '/skills', statusCode: 301 } } as any,
    // 2026-08-12 category rework: the verb-shaped cluster slugs were renamed to
    // the domain nouns people actually search. Search Console showed 4 clicks
    // across 3 months, so nothing ranked here, but the old URLs shipped in the
    // homepage grid and the tag redirect map, so they keep resolving.
    '/skills/plan': { redirect: { to: '/skills/planning', statusCode: 301 } } as any,
    '/skills/master-agent': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    // Points at the live target directly: `writing` retired into `anti-slop`
    // on 2026-08-22, and a chain of two 301s reads as neglect.
    '/skills/docs': { redirect: { to: '/skills/anti-slop', statusCode: 301 } } as any,
    '/skills/review': { redirect: { to: '/skills/code-review', statusCode: 301 } } as any,
    '/skills/debug': { redirect: { to: '/skills/testing', statusCode: 301 } } as any,
    '/skills/ship': { redirect: { to: '/skills/devops', statusCode: 301 } } as any,
    // 2026-08-13 cull: 16 categories to 12. `debugging` and `browser-automation`
    // were absorbed by the track that already answers the same question;
    // `marketing` and `research` had no successor, so they land on the index.
    '/skills/debugging': { redirect: { to: '/skills/testing', statusCode: 301 } } as any,
    '/skills/browser-automation': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/skills/marketing': { redirect: { to: '/skills', statusCode: 301 } } as any,
    '/skills/research': { redirect: { to: '/skills', statusCode: 301 } } as any,
    // 2026-08-22: `writing` retired into `anti-slop`, same audience with the
    // anti-slop anchor replacing the generic one.
    '/skills/writing': { redirect: { to: '/skills/anti-slop', statusCode: 301 } } as any,
    // 2026-08-15: the leaderboard became the `all` range of the trending board,
    // so one page now answers "what is moving" and "what is biggest". The
    // range inherits the leaderboard's title and description verbatim, which is
    // what keeps the ~4,100/mo repository cluster attached to a live URL.
    //
    // Paginated URLs land here too. Route rules match on pathname, and Nitro
    // carries the original query across, so `/skills/leaderboard?page=2`
    // becomes `/skills/trending?range=all&page=2`. Verified against a running
    // server rather than assumed. That URL serves 200 and self-canonicalises
    // to `?range=all`, so the stray `page` is dropped by the canonical instead
    // of by the redirect. Pagination went with the page: page 2 has no
    // successor, and only page 1 ever ranked.
    '/skills/leaderboard': { redirect: { to: '/skills/trending?range=all', statusCode: 301 } } as any,
    // Harlan's curated collections merged into the category pages, so each
    // retired collection URL points at the page that absorbed it rather than
    // 404ing. `vue-nuxt` and `react` went to the framework pages that already
    // own those queries; `apple-apps` and `knowledge-workspace` were culled.
    '/@harlan-zw/design-engineering-essentials': { redirect: { to: '/skills/design', statusCode: 301 } } as any,
    '/@harlan-zw/frontend-design': { redirect: { to: '/skills/design', statusCode: 301 } } as any,
    '/@harlan-zw/essentials': { redirect: { to: '/skills/coding', statusCode: 301 } } as any,
    '/@harlan-zw/codebase-architecture': { redirect: { to: '/skills/planning', statusCode: 301 } } as any,
    '/@harlan-zw/agent-workflow': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/@harlan-zw/agent-building': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/@harlan-zw/code-review': { redirect: { to: '/skills/code-review', statusCode: 301 } } as any,
    '/@harlan-zw/web-quality': { redirect: { to: '/skills/performance', statusCode: 301 } } as any,
    '/@harlan-zw/backend-data': { redirect: { to: '/skills/backend-data', statusCode: 301 } } as any,
    '/@harlan-zw/browser-automation': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/@harlan-zw/vue-nuxt': { redirect: { to: '/frameworks/vue', statusCode: 301 } } as any,
    '/@harlan-zw/react': { redirect: { to: '/frameworks/react', statusCode: 301 } } as any,
    '/_nuxt/v2/**': {
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'cloudflare-cdn-cache-control': 'max-age=60',
      },
    },
    // Dev-only sandbox (404s in production, see app/pages/_playground/mdxg.vue).
    // Google had it indexed from before that gate landed; block crawling so it
    // drops out instead of recurring as a broken-page finding.
    '/_playground/**': { robots: false } as any,
    // Raw API responses (e.g. /api/skills-raw/** serves text/markdown SKILL.md
    // content for agents/tools). Not HTML documents, so title/viewport/lang/OG
    // checks against them are meaningless. Keep them fetchable (routes stay
    // live for the MCP server and AI agents that call them directly) but tell
    // crawlers not to index them as pages.
    '/api/**': { robots: false } as any,
    // OAuth redirect stubs (layers/identity/server/routes/auth/*) — they 302
    // straight to GitHub with no document to add an H1/title to.
    '/auth/**': { robots: false } as any,
  },

  future: {
    compatibilityVersion: 5,
  },

  experimental: {
    checkOutdatedBuildInterval: 5 * 60 * 1000,
    viteEnvironmentApi: false,
  },

  vite: {
    plugins: [dependencyPluginCompat()],
  },

  compatibilityDate: '2026-07-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs',
      },
    },
  },

  fonts: {
    defaults: {
      subsets: ['latin'],
      preload: true,
    },
    families: [
      { name: 'Plus Jakarta Sans', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
      { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
    ],
  },

  // `serverBundle: 'local'` shipped all of lucide + vscode-icons + simple-icons
  // into the Worker (8.85 MB) for the ~270 icons actually used. Every icon name
  // in this codebase is a static literal, so scanning resolves them all and
  // inlines just those; anything the scanner misses falls back to the Iconify
  // API rather than rendering nothing. See docs/ops/bundle-baseline-2026-07-23.md.
  icon: {
    serverBundle: false,
    clientBundle: {
      scan: {
        // Icon names also live in plain TS (file-tree extension map, cluster
        // definitions), which the default globs skip for performance.
        globInclude: ['**/*.{vue,jsx,tsx,md,mdc,mdx}', 'app/**/*.ts', 'layers/**/*.ts'],
      },
      includeCustomCollections: true,
      // ~270 icons overflow the 256 KB default.
      sizeLimitKb: 1024,
    },
  },

  sitemap: {
    // `/learn` index is a 55-word card list, noindex since 2026-08-22
    // (GOOGLE_RECOVERY.md). Articles stay indexable and sitemap-listed; only
    // the bare index leaves. Global so no child sitemap can re-adopt it
    // (authors.xml was listing it via an app-source merge quirk).
    exclude: ['/learn'],
    sitemaps: {
      pages: {
        includeAppSources: true,
        exclude: ['/skills/**', '/gh/**', '/people/**', '/@**', '/admin/**', '/me/**', '/login', '/onboarding/**', '/collections/new', '/cli/**', '/brand-kit/_**'],
      },
      skills: {
        sources: ['/api/__sitemap__/skills'],
        includeAppSources: false,
        chunks: 10000,
      },
      authors: {
        sources: ['/api/__sitemap__/authors'],
        includeAppSources: false,
      },
      sources: {
        sources: ['/api/__sitemap__/trusted-authors'],
        includeAppSources: false,
      },
      // `orgs` removed: it listed every owner hub (/gh/<owner>) unconditionally,
      // but those pages render noindex,follow. Advertising noindex URLs in the
      // sitemap was the bulk of GSC "Crawled – currently not indexed" (~8k) and
      // the sitewide quality demotion. /orgs/* still 301s to /gh/* for link equity.
      // `tags` now emits only editorial keep=1 vocab tags; the 274 auto-list
      // tag pages went noindex 2026-08-22 (GOOGLE_RECOVERY.md, topology audit).
      tags: {
        sources: ['/api/__sitemap__/tags'],
        includeAppSources: false,
      },
    },
  },

  sentry: {
    enabled: process.env.NODE_ENV === 'production',
    org: 'harlan-zw',
    project: 'skilld',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Pin the name the bundler plugin associates sourcemaps with, so it matches
    // the release the runtime reports instead of whatever it infers.
    release: { name: sentryRelease() },
    sourcemaps: {
      disable: !hasSentryAuthToken,
      filesToDeleteAfterUpload: ['**/*.map'],
    },
    bundleSizeOptimizations: {
      excludeReplayShadowDom: true,
      excludeReplayIframe: true,
      excludeReplayWorker: true,
    },
    telemetry: false,
  },

  sourcemap: {
    client: hasSentryAuthToken ? 'hidden' : false,
    server: false,
  },
})
