import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { edgeCache } from '@harlan-zw/nuxt-cloudflare/cache'
import { unpublishedAgentPaths } from './layers/marketing/app/utils/agent-pages'
import { frozenNoindexPaths, isPageAdmitted } from './layers/marketing/app/utils/page-admissions'
import pkg from './package.json'
import { dependencyPluginCompat } from './scripts/lib/dependency-plugin-compat'
import { withBuildAssetMissFallthrough } from './scripts/lib/static-asset-fallthrough'
import { externalCheckin } from './shared/checkin-external'
import { iconifyCollections } from './shared/icon-collections'
import { SENTRY_DSN, sentryRelease, sentryReportingEnabled } from './shared/sentry'
import { SESSION_NAME } from './shared/server/session-access'
import { CLI_INSTALL_SCRIPTS } from './shared/skill-commands'

/** Every `/agents/*` page file, so the sitemap reads the admission decision for a page nobody listed. */
function discoveredAgentRoutes(): string[] {
  return readdirSync(fileURLToPath(new URL('./layers/marketing/app/pages/agents', import.meta.url)))
    .filter(file => file.endsWith('.vue') && file !== 'index.vue')
    .map(file => `/agents/${file.slice(0, -'.vue'.length)}`)
}

/** Static comparison routes share the page admission gate. */
function discoveredComparisonRoutes(): string[] {
  return readdirSync(fileURLToPath(new URL('./layers/marketing/app/pages/compare', import.meta.url)))
    .filter(file => file.endsWith('.vue'))
    .map(file => `/compare/${file.slice(0, -'.vue'.length)}`)
}

const iconCollections = iconifyCollections(pkg)

/**
 * Vendor packages only lazy chunks import; see `vendor-shared` below. The
 * last alternative also matches Nuxt's `comark-content%2Fcomponents.mjs`
 * template, whose id carries no path separators.
 */
const LAZY_ONLY_VENDOR = /[\\/]node_modules[\\/](?:zod|rangi)[\\/]|comark-content(?:[\\/]|%2F)/

const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN)
  || existsSync('.env.sentry-build-plugin')

export default defineNuxtConfig({
  checkin: { external: externalCheckin },
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
    // 2026-08-22 agent lane, where agents discover pages without Google's
    // sitemap: list the agent-only sitemap in llms.txt. The module's `notes` config exists but never renders, so
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
      overridesKb: {
        'server/plugins/sentry.ts': 328,
        // The middleware reads track slugs from `clusters.ts`, which also holds
        // every pin. Pins became `owner/repo/name` keys, about 1.3 kB more.
        'layers/registry/server/middleware/skills-to-gh-redirect.ts': 22,
      },
    },
  },

  modules: [
    '@harlan-zw/nuxt-checkin',
    '@harlan-zw/nuxt-cf-jobs',
    // Before nuxt-cloudflare, on purpose. Both check each HTML response in
    // `beforeResponse`, in module order. nuxt-skew-protection has to drop its
    // `__nkpv` version cookie from a document a shared cache may keep before
    // nuxt-cloudflare looks, or nuxt-cloudflare sees the cookie and marks every
    // browser navigation `no-store`, so only crawlers would ever fill the cache.
    'nuxt-skew-protection',
    '@harlan-zw/nuxt-cloudflare',
    '@harlan-zw/nuxt-dx',
    '@harlan-zw/nuxt-use-query',
    '@harlan-zw/nuxt-wide-events',
    './modules/mdxg/src/module',
    './modules/og-static-fonts/module',
    './modules/file-icons/module',
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
  ],

  nuxtCloudflare: {
    // The module's own cache driver still rejects on KV errors, and Nitro's
    // route cache (`defineCachedFunction`, e.g. the llms.txt build) feeds every
    // rejection to `captureError`, so one hot key under a crawler sweep turned
    // each `KV PUT failed: 429` into a fresh Sentry issue per hot path. The
    // `cache` storage below replaces it: same KV_CACHE binding, same 60-second
    // TTL floor, but a rejected write resolves and reports as a `cache-write`
    // wide event instead of an error (see #156).
    kvCache: false,
  },

  wideEvents: {
    request: true,
    service: 'skilld',
    fields: [
      // `api-v1-contract` and `api-v1-handler`: the public API operation that
      // broke its contract or threw, so Sentry groups failures per operation.
      'api.operation',
      // `artifact-build-reuse`: which Resolution, which lookup matched, and
      // the ready Resolution it reused. The daily check-in counts the hits.
      'artifact.resolutionId',
      'artifact.reuseLookup',
      'artifact.reusedFrom',
      'attempt',
      'batch.count',
      'cache.ageSeconds',
      'cache.key',
      'cache.readFailed',
      'cache.servedStale',
      'cache.writeFailed',
      'eligible.count',
      'error.count',
      'failed.count',
      'failed.tasks',
      // `artifact-github-credential`: which fallback token a build read GitHub
      // with after the read App gave none.
      'github.credential',
      'github.endpoint',
      'github.step',
      'item.count',
      // `search-intent`: how long the query model took, so the latency
      // budget can be checked against production instead of guessed.
      'model.durationMs',
      // `task-search`: what one model answer cost, so the daily budget and
      // the eval's per-question figures can be checked against production.
      // The question text is never a field.
      'model.cachedTokens',
      'model.costMicros',
      'model.droppedRefs',
      'model.errorCode',
      'model.inputTokens',
      'model.outputTokens',
      'model.searches',
      'model.turns',
      'operation',
      'outcome',
      'processed.count',
      'rateLimit.limit',
      'rateLimit.remaining',
      // An outcome says a branch fired; these say which one and on what. A
      // discovery row parked with `outcome: 'unknown'` and nothing else was
      // indistinguishable from every other parked row in the archive.
      'reason',
      'reinvoked.count',
      'reinvoked.tasks',
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
    // The module publishes its retention window (36000s) to
    // `@harlan-zw/nuxt-cloudflare`, which honours an HTML cache rule up to it,
    // and drops the version cookie from any document a shared cache may keep.
    // The shell renders signed out for everyone, so `/skills/trending` has the
    // first rule. Skill, repo and category pages follow once it holds.
  },

  scripts: {
    // Bundling a registry script downloads it at build time. When
    // static.cloudflareinsights.com is unreachable, that download threw and
    // every build failed (#208). The fallback keeps the build green: a failed
    // download serves the remote URL at runtime instead. Online builds still
    // bundle as before.
    assets: {
      fallbackOnSrcOnBundleFail: true,
    },
    registry: {
      // Bundling the beacon fetches beacon.min.js from
      // static.cloudflareinsights.com at transform time, so every vitest file
      // fails on the network-less CI runner (#204). Telemetry serves no test,
      // and vitest sets NODE_ENV=test before nuxt.config.ts is evaluated.
      ...(process.env.NODE_ENV === 'test'
        ? {}
        : {
            cloudflareWebAnalytics: {
              token: 'fefd4b7eafe04d5f81621e43e5d5ef80',
              trigger: 'server',
            },
          }),
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
    llmsTxt: {
      markdownLinks: true,
    },
    // The module's negotiation also reads User-Agent, which a shared cache
    // cannot key on. server/handlers/content-negotiation.ts decides from
    // Accept and Sec-Fetch-Dest instead. Explicit `.md` URLs and the
    // `Link: rel="alternate"` header on HTML stay with the module.
    contentNegotiation: false,
    // 2.1.0 added /sitemap.md, on by default. It reads every ai_ready_pages
    // row with no limit (about 143k), which brings back the dump that
    // llms-full.txt retired. Every .md page would also link to it.
    sitemapMd: false,
    mcp: {
      tools: false,
      resources: false,
    },
    // RFC 9727: Agents find the skilld API from /.well-known/api-catalog. The
    // module appends the MCP server entry it generates from mcpServerCard.
    apiCatalog: {
      entries: [{
        anchor: 'https://skilld.dev/api/v1',
        serviceDesc: { href: 'https://skilld.dev/api/v1/openapi.json', type: 'application/vnd.oai.openapi+json;version=3.1' },
        serviceDoc: { href: 'https://skilld.dev/developers?setup=api', type: 'text/html' },
      }],
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
    description: 'Discover curated agent skills with provenance and a run or install command handoff.',
    instructions: 'skilld.dev is a curated registry of agent skills. Search first, inspect provenance before recommending a skill, then return the run command for the user to approve and run. Offer the install command only when the user wants the skill in every session. Without a shell, such as in a chat app, follow the markdown from get_skill for this session, and tell the user the skill name and source repository first. skilld.dev shows who wrote a skill and where its source lives. It does not review skills for safety, so never call a skill safe or verified. This server never runs or installs anything.',
    sessions: false,
    browserRedirect: '/',
    // The toolkit rejects a request whose Origin header is another site. Server-side
    // clients send none. The Claude and ChatGPT web apps may, so they are listed.
    security: {
      allowedOrigins: ['https://skilld.dev', 'https://claude.ai', 'https://claude.com', 'https://chatgpt.com', 'https://chat.openai.com'],
    },
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
      style: [
        // A browser orders cascade layers by where each name first appears.
        // Nuxt inlines component styles above `entry.css`, so a scoped
        // `@layer components` block used to name that layer before Tailwind's
        // `base`, and the preflight reset (`* { padding: 0; border: 0 }`) beat
        // every component rule until hydration added a style that fixed the
        // order. Skill chips rendered without padding or border, then grew.
        // Naming the order first makes the server render match the hydrated one.
        { innerHTML: '@layer theme, base, components, utilities;', tagPriority: -20 },
      ],
    },
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  // The server renders every public page signed out, so one stored copy can
  // serve every visitor. The browser loads the session after hydration, and a
  // page that needs it on the server says so with the `session` or `auth`
  // route middleware.
  auth: {
    loadStrategy: 'client-only',
  },

  runtimeConfig: {
    // nuxt-auth-utils names its cookie from here; `readUserSession` looks for
    // the same name before it opens a session.
    session: { name: SESSION_NAME, password: '' },
    sessionPassword: '',
    adminSecret: '',
    tokenKey: '',
    checkinToken: '',
    // Shared with the skill-harness Worker as SKILLGEN_SITE_TOKEN. It reads Skillgen opt-ins.
    skillgenToken: '',
    publicSiteUrl: 'https://skilld.dev',
    // The OpenAI plugin portal's domain-verification token. Set the Worker
    // secret NUXT_OPENAI_APPS_CHALLENGE. /.well-known/openai-apps-challenge
    // serves it, and answers 404 while it is empty.
    openaiAppsChallenge: '',
    // Task search, the search box's opt-in model answer. Set the Worker
    // variable NUXT_TASK_SEARCH_ENABLED=false to switch it off without a
    // deploy. The budget is micro-dollars per UTC day across every visitor:
    // 1,000,000 is $1, about 1,400 questions at the measured $0.0007.
    taskSearch: {
      enabled: true,
      dailyBudgetMicros: 1_000_000,
    },
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
  },

  nitro: {
    preset: 'cloudflare-module',
    // Registered here, not scanned from `server/middleware`, because nuxt-ai-ready
    // claims every `.md` path and scanned middleware runs after a module's.
    handlers: [
      // First, so content negotiation also leaves Skill file URLs alone.
      { middleware: true, handler: '~~/server/handlers/skill-file-page.ts' },
      { middleware: true, handler: '~~/server/handlers/skill-md-probe.ts' },
      { middleware: true, handler: '~~/server/handlers/content-negotiation.ts' },
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
      'data': {
        driver: 'cloudflare-kv-binding',
        binding: 'KV_DATA',
      },
      'cache': {
        // Best-effort route-cache writes over KV_CACHE: the driver wraps
        // unstorage's cloudflare-kv-binding, floors every TTL at Cloudflare's
        // 60-second minimum, and turns write rejections into wide events
        // instead of propagating them to Nitro's `captureError` (issue #156).
        driver: fileURLToPath(new URL('./server/runtime/kv-cache-storage.ts', import.meta.url)),
        binding: 'KV_CACHE',
        defaultTtl: 30 * 24 * 60 * 60,
      },
      // Per-entity read-through keys (one per skill, query, or owner) live in
      // the Workers Cache API, which bills nothing per write. KV_CACHE keeps
      // only global keys. See server/runtime/edge-cache-storage.ts.
      'edge-cache': {
        driver: fileURLToPath(new URL('./server/runtime/edge-cache-storage.ts', import.meta.url)),
        // Nitro writes an SWR route's entry with no per-write TTL, so this
        // default sets the Cache API max-age for that write. It must outlive
        // every route's fresh + stale window: skill-live (1d fresh, 7d stale)
        // lost its stale window under the driver's 24h default, because the
        // entry expired exactly as it went stale. 30d matches the KV cache
        // mount. Freshness past a route's windows is decided by the stored
        // payload, never by this TTL.
        defaultTtl: 30 * 24 * 60 * 60,
      },
    },
    // Nitro imports dev mounts in Node at build time, where the Cache API does
    // not exist. Dev and Vitest get an in-memory mount instead.
    devStorage: {
      'edge-cache': { driver: 'memory' },
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
    // Send only the origin to other sites, never the page path a visitor read.
    '/**': { headers: { 'referrer-policy': 'strict-origin-when-cross-origin' } } as any,
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
    // Proxied images set their own cache headers per result.
    '/_img/**': { robots: false } as any,
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
    // The first HTML in Workers Cache, proved here before skill, repo and
    // category pages follow. It is safe because the server renders every public
    // page signed out and negotiates on Accept and Sec-Fetch-Dest only, both
    // named in Vary. The cache key includes the query string, so each `?range=`
    // board is its own entry. Browsers still get no-store and ask the edge.
    //
    // 60s fresh: the board's feed already caches for 300s, so this adds at most
    // a minute. 3600s stale: the board's inputs move every 15 minutes at most
    // (X mentions) and hourly (social mentions, engagement), so a quiet colo
    // may serve one copy up to an hour old while it refreshes in the
    // background, rather than render on every visit. The 3660s total sits well
    // inside the 36000s nuxt-skew-protection keeps old chunks for.
    // `scripts/check-edge-cache.ts` proves it after each deploy.
    '/skills/trending': edgeCache({ maxAge: 60, staleWhileRevalidate: 3600 }),
    // Demos change on deploy, and when a run check flag hides one. A flag
    // takes two failed checks, so a day of stale serving on a quiet colo is
    // within the time the checks themselves take.
    '/skills/demos': edgeCache({ maxAge: 300, staleWhileRevalidate: 86400 }),
    '/skills/demos/**': edgeCache({ maxAge: 300, staleWhileRevalidate: 86400 }),
    // The CLI and developer pages read no data and no session, so they change
    // only on deploy, and a deploy starts a new cache key. Uncached, each view
    // rendered in the Worker: 110 to 250 ms to first byte from Sydney on
    // 2026-10-07, against about 65 ms for a cached page. The 36000s total
    // matches the window nuxt-skew-protection keeps old chunks for.
    '/cli': edgeCache({ maxAge: 3600, staleWhileRevalidate: 32400 }),
    '/developers': edgeCache({ maxAge: 3600, staleWhileRevalidate: 32400 }),
    // The homepage is the same shape as the board: rendered signed out, no
    // cookie read, and fed by the same feeds, so the same lifetimes hold. A
    // render measured 300 to 480 ms to first byte from Sydney on 2026-10-01.
    '/': edgeCache({ maxAge: 60, staleWhileRevalidate: 3600 }),
    // Skill pages, rendered signed out like the board; likes and the session
    // load in the browser. A Skill only changes when a sync lands, so 300s
    // fresh. A render measured 0.3 to 2.7 s to first byte from Sydney on
    // 2026-10-01. nuxt-cloudflare refuses to store any non-200, so a 404 or a
    // 503 from a D1 blip never reaches the cache.
    //
    // Nitro matches route rules with radix3, which treats trailing params as
    // optional, so this rule also covers the owner and repo hubs. They render
    // signed out too, and the post-deploy proof checks one of each. File deep
    // links (`/gh/o/r/s/-/...`) have more segments and stay uncached.
    '/gh/:owner/:repo/:name': edgeCache({ maxAge: 300, staleWhileRevalidate: 3600 }),
    // Raw markdown and the typeahead index deliberately keep browser caching
    // too: both are large, identical for everyone, and only change when the
    // registry does.
    '/api/skills-raw/**': {
      headers: {
        'cache-control': 'public, max-age=300',
        'cloudflare-cdn-cache-control': 'public, max-age=300',
      },
    } as any,
    // The file list now comes from D1, identical for everyone and only
    // changing on a sync, so the edge can hold it for a few minutes.
    '/api/skill-files/**': edgeCache({ maxAge: 300, staleWhileRevalidate: 3600 }),
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
    // The printed native install commands. `CLI_INSTALL_SCRIPTS` says why each is a 302.
    '/install.sh': { redirect: { to: CLI_INSTALL_SCRIPTS['/install.sh'], statusCode: 302 } } as any,
    '/install.ps1': { redirect: { to: CLI_INSTALL_SCRIPTS['/install.ps1'], statusCode: 302 } } as any,
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
    // `marketing` had no successor, so it lands on the index. `research` came
    // back as a track on 2026-09-04, so its redirect went with it.
    '/skills/debugging': { redirect: { to: '/skills/testing', statusCode: 301 } } as any,
    '/skills/browser-automation': { redirect: { to: '/skills/context-engineering', statusCode: 301 } } as any,
    '/skills/marketing': { redirect: { to: '/skills', statusCode: 301 } } as any,
    // 2026-09-04: Security and auth joined Backend and data. Both covered auth,
    // and one combined track keeps the homepage grid to three rows.
    '/skills/security': { redirect: { to: '/skills/backend-data', statusCode: 301 } } as any,
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
    // server rather than assumed. The page then answers by the real page count
    // of the admitted list (`resolveTrendingPage`): a page past the last one is
    // a 404, and a real page carries its own canonical. Old leaderboard pages 2
    // to 5 therefore 404 unless the list truly has that page. Only page 1 ever
    // ranked, and it canonicalises to the bare `?range=all`.
    '/skills/leaderboard': { redirect: { to: '/skills/trending?range=all', statusCode: 301 } } as any,
    // Harlan's curated collections merged into the category pages, so each
    // retired collection URL points at the page that absorbed it rather than
    // 404ing. `vue-nuxt` and `react` went to the framework pages that already
    // own those queries. The 2026-09-30 retirements (`apple-apps`, `knowledge-workspace`)
    // and the noindex `-stack` trio live in shared/retired-collections.ts.
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
    // `/alt` was the noindex prototype of the homepage it became on
    // 2026-09-04. Anyone holding the link lands on the real page.
    '/alt': { redirect: { to: '/', statusCode: 301 } } as any,
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
    $client: {
      // The browser reports errors only (`tracesSampleRate: 0` in
      // sentry.client.config.ts), yet the client plugin still added
      // browserTracingIntegration, so router and web-vitals instrumentation
      // shipped and ran on every page. Client build only: the Worker keeps its
      // sampled traces. Vitest runs server code through this config too, so
      // tests keep tracing.
      define: process.env.NODE_ENV === 'test' ? {} : { __SENTRY_TRACING__: false },
      // Client build only. Applied to the server build too, the group left an
      // unresolved chunk placeholder (`!~{002}~`) in Nuxt 4.6's inline-style
      // chunks, and the Nitro bundle failed. That forced `inlineStyles: false`,
      // which linked up to nine render-blocking stylesheets per page.
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              // Googlebot spends 58% of its requests on JavaScript and renders
              // each page with its own fetches, so the number of files a page
              // needs is a crawl cost. Rolldown's default split made one chunk per
              // set of importers, so a `/gh` page preloaded 75 files, 38 of them
              // under 3 KB. This gathers the small `node_modules` modules that
              // two or more chunks share into one chunk. Larger vendor modules
              // keep their own lazy chunks.
              //
              // App code is left out on purpose. A shared app module in a group
              // becomes a hub every importer names by hash, so one edit rehashed
              // 44 chunks in a measured build. The vendor chunk only changes
              // when a dependency does. Numbers: docs/ops/crawl-efficiency-2026-09-30.md.
              //
              // zod and rangi stay out. Only lazy pages use them (WebMCP, make-skill,
              // developers, /me, admin; mdxg docs), but grouped they rode in the one
              // vendor chunk every page preloads.
              //
              // comark-content stays out too. A group takes a module's static
              // imports with it, and its ContentRenderer imports every content
              // component, so the Skill card, the package setup form and zod
              // (through that form) rode in this chunk on every page.
              //
              // Two groups, so a page loads only the vendor code it uses.
              // `vendor-shared` holds what the app entry imports, which every
              // page runs. `vendor-lazy` holds the rest, such as the reka-ui
              // menus, selects and hover cards only some pages open. It splits
              // by the set of pages that import each module, and folds sets
              // under 20 kB into a neighbour, so a launch page gains 4 to 8
              // files. One chunk held 692 kB raw on every page.
              groups: [
                {
                  name: 'vendor-shared',
                  test: (id: string) => id.includes('node_modules') && !LAZY_ONLY_VENDOR.test(id),
                  tags: ['$initial'],
                  minShareCount: 2,
                  maxModuleSize: 8 * 1024,
                },
                {
                  name: 'vendor-lazy',
                  test: (id: string) => id.includes('node_modules') && !LAZY_ONLY_VENDOR.test(id),
                  minShareCount: 2,
                  maxModuleSize: 8 * 1024,
                  entriesAware: true,
                  entriesAwareMergeThreshold: 20 * 1024,
                },
              ],
            },
          },
        },
      },
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

  ui: {
    // Nuxt UI otherwise writes a theme file for every component it ships, and
    // Tailwind emits their variant classes into the render-blocking entry
    // stylesheet. Detection keeps the components this app renders. Every
    // component here is named statically, so nothing needs listing.
    experimental: { componentDetection: true },
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
  // inlines just those. The Iconify API fallback is off, so a visitor's browser
  // never calls api.iconify.design. See docs/ops/bundle-baseline-2026-07-23.md.
  icon: {
    collections: iconCollections,
    serverBundle: false,
    fallbackToApi: false,
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
    // `/learn` index is a 55-word card list, noindex since 2026-08-22 as a
    // thin page. Articles stay indexable and sitemap-listed; only the bare
    // index leaves. Global so no child sitemap can re-adopt it.
    exclude: ['/learn'],
    sitemaps: {
      pages: {
        includeAppSources: true,
        // An /agents page waits on a CLI release; it answers 404 until then.
        exclude: ['/skills/**', '/gh/**', '/people/**', '/make-skill', '/@**', '/admin/**', '/me/**', '/login', '/onboarding/**', '/collections/new', '/cli/**', '/brand-kit', '/brand-kit/_**', ...unpublishedAgentPaths(), ...frozenNoindexPaths([...discoveredAgentRoutes(), ...discoveredComparisonRoutes()])],
      },
      skills: {
        sources: ['/api/__sitemap__/skills'],
        includeAppSources: false,
        chunks: 10000,
      },
      // Experiment E, remove 2026-11-11: retired URLs (301, 404, 410) with a
      // fresh lastmod, so Google recrawls and drops them sooner. Not submitted.
      // Steps: `layers/registry/server/utils/retired-sitemap.ts`.
      retired: {
        sources: ['/api/__sitemap__/retired'],
        includeAppSources: false,
        chunks: 10000,
      },
      // `/skills/demos` and one page per demo, which the pages sitemap's
      // `/skills/**` exclude drops. Listed while page-admissions admits
      // `/skills/demos`, the entry every demo page reads.
      ...(isPageAdmitted('/skills/demos')
        ? { demos: { sources: ['/api/__sitemap__/demos'], includeAppSources: false } }
        : {}),
      // `authors` and `sources` removed 2026-10-01 (owner decision): author
      // profiles, collections, owner hubs and multi-Skill repository hubs render
      // `noindex,follow`. A single-Skill repository hub is the Skill's own page,
      // so the skills sitemap lists it when the trending admission rule admits it.
      // `orgs` removed: it listed every owner hub (/gh/<owner>) unconditionally,
      // but those pages render noindex,follow. Advertising noindex URLs in the
      // sitemap was the bulk of GSC "Crawled – currently not indexed" (~8k) and
      // the sitewide quality demotion. /orgs/* still 301s to /gh/* for link equity.
      // `tags` removed 2026-09-30 (SEO experiment, gate 2026-11-11): the eight
      // keep=1 tag pages went noindex with every non-trending page. Cull path:
      // revert the experiment commit, which restores `__sitemap__/tags.ts`.
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
      excludeDebugStatements: true,
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
