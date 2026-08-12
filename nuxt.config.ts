import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dependencyPluginCompat } from './scripts/lib/dependency-plugin-compat'
import { withBuildAssetMissFallthrough } from './scripts/lib/static-asset-fallthrough'
import { SENTRY_DSN, sentryRelease, sentryReportingEnabled } from './shared/sentry'

const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN)
  || existsSync('.env.sentry-build-plugin')

export default defineNuxtConfig({
  extends: ['./layers/admin', './layers/identity', './layers/registry', './layers/marketing', './layers/mcp'],

  hooks: {
    'nitro:config': (nitroConfig) => {
      // Cloudflare serves existing files before the Worker. Let misses enter
      // Nitro so its build-asset route can return a non-cacheable 404.
      nitroConfig.publicAssets = withBuildAssetMissFallthrough(
        nitroConfig.publicAssets || [],
        '/_nuxt/v2/',
      )
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
    // Pages render dynamically, so three versions cover active clients without
    // carrying weeks of obsolete assets into every Worker upload.
    maxNumberOfVersions: 3,
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
    indexNow: false,
    mcp: {
      tools: false,
      resources: false,
    },
    mcpServerCard: {
      name: 'dev.skilld/registry',
      title: 'skilld.dev discovery',
      description: 'Search curated agent skills and generate install commands.',
      websiteUrl: 'https://skilld.dev',
    },
    agentSkills: {
      skills: [{
        source: 'local',
        name: 'skilld-registry',
        description: 'Search skilld.dev and generate verified skill installation commands.',
        file: './skills/skilld-registry/SKILL.md',
      }],
    },
  },

  mcp: {
    route: '/api/mcp',
    name: 'skilld.dev discovery',
    version: '1.0.0',
    description: 'Discover curated agent skills with provenance and safe install-command handoff.',
    instructions: 'Search first, inspect provenance before recommending a skill, then return an install command for the user to approve and run. This server never executes installs.',
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

  content: {
    database: {
      type: 'd1',
      bindingName: 'DB',
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
    '/collections': { redirect: { to: '/community', statusCode: 301 } } as any,
    // 2026-08-12 category rework: the verb-shaped cluster slugs were renamed to
    // the domain nouns people actually search. Search Console showed 4 clicks
    // across 3 months, so nothing ranked here, but the old URLs shipped in the
    // homepage grid and the tag redirect map, so they keep resolving.
    '/skills/plan': { redirect: { to: '/skills/planning', statusCode: 301 } } as any,
    '/skills/master-agent': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/skills/docs': { redirect: { to: '/skills/writing', statusCode: 301 } } as any,
    '/skills/review': { redirect: { to: '/skills/code-review', statusCode: 301 } } as any,
    '/skills/debug': { redirect: { to: '/skills/debugging', statusCode: 301 } } as any,
    '/skills/ship': { redirect: { to: '/skills/devops', statusCode: 301 } } as any,
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
    '/@harlan-zw/browser-automation': { redirect: { to: '/skills/browser-automation', statusCode: 301 } } as any,
    '/@harlan-zw/vue-nuxt': { redirect: { to: '/frameworks/vue', statusCode: 301 } } as any,
    '/@harlan-zw/react': { redirect: { to: '/frameworks/react', statusCode: 301 } } as any,
    '/@harlan-zw/apple-apps': { redirect: { to: '/skills', statusCode: 301 } } as any,
    '/@harlan-zw/knowledge-workspace': { redirect: { to: '/skills', statusCode: 301 } } as any,
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
    optimizeDeps: {
      exclude: ['shiki'],
    },
  },

  // Shiki highlighting for server-rendered MDC and raw skill markdown.
  // The JavaScript regex engine works in Cloudflare workerd without
  // Oniguruma WASM. Explicit languages cover common SKILL.md examples.
  // Dual themes emit the CSS variables consumed by app/assets/css/main.css.
  mdc: {
    highlight: {
      shikiEngine: 'javascript',
      theme: { light: 'github-light', dark: 'github-dark' },
      langs: ['diff', 'ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'vue', 'css', 'html', 'yaml', 'md', 'mdc'],
    },
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
    sitemaps: {
      pages: {
        includeAppSources: true,
        exclude: ['/skills/**', '/gh/**', '/people/**', '/@**', '/admin/**', '/me/**', '/login', '/onboarding/**', '/collections/new', '/cli/**'],
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
