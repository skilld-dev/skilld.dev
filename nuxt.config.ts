import { existsSync } from 'node:fs'
import { SENTRY_DSN } from './shared/sentry'

const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN)
  || existsSync('.env.sentry-build-plugin')

export default defineNuxtConfig({
  extends: ['./layers/admin', './layers/identity', './layers/registry', './layers/guides', './layers/marketing'],

  modules: [
    'nuxt-cf-jobs',
    './modules/mdxg/src/module',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxt/scripts',
    '@nuxtjs/seo',
    'nuxt-ai-ready',
    '@nuxt/a11y',
    '@nuxtjs/html-validator',
    'motion-v/nuxt',
    '@vueuse/nuxt',
    'nuxt-auth-utils',
    '@sentry/nuxt/module',
    'nuxt-skew-protection',
  ],

  cfJobs: {
    // Discover each layer's server/tasks directory. Cron expressions live with
    // their handlers; the module derives Nitro task registration, scheduling,
    // and Cloudflare triggers from that single source of truth.
    tasksDir: true,
    scheduledTasks: process.env.NODE_ENV === 'production',
    // This app currently uses scheduled tasks only. Durable recovery requires
    // the nuxt-cf-jobs D1 schema and queue consumers, neither of which exists yet.
    reconcile: false,
    queues: {},
  },

  // Version skew protection: after a deploy, clients still running the previous
  // build fetch old hashed chunks. Instead of 404ing (Sentry SKILLD-4), old
  // assets are retained in the SKEW_PROTECTION KV namespace and served back.
  // cloudflare-module has no WebSocket support (that needs cloudflare-durable),
  // so updates are detected via polling. Build-time writes go through the
  // wrangler CLI (namespaceId); runtime reads go through the KV binding.
  skewProtection: {
    enabled: process.env.NODE_ENV === 'production',
    updateStrategy: 'polling',
    // Silently reload to the new build when the user goes idle rather than
    // showing a prompt (which would need a <SkewNotification/> on the anonymous
    // SEO surface). Old assets are served meanwhile, so nothing 404s regardless.
    reloadStrategy: 'idle',
    // Persist each build's assets to KV only from CI. The runtime KV read mount
    // is always active (set whenever storage.driver exists), but the build-time
    // writes shell out to hundreds of `wrangler kv put` calls against prod KV,
    // which we don't want a local `pnpm build` doing (and local OAuth lacks the
    // KV scope anyway). GitHub Actions sets CI=true.
    bundleAssets: !!process.env.CI,
    storage: {
      driver: 'cloudflare-kv-binding',
      binding: 'SKEW_PROTECTION',
      namespaceId: '399c1b7cc7994c31a5e9abc7e65b2bea',
    },
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
    description: 'Curated agent skills from trusted open-source developers',
  },

  aiReady: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
    cron: false,
    runtimeSync: true,
    indexNow: true,
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
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
      enabled: process.env.NODE_ENV === 'production',
      environment: 'production',
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
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
    storage: {
      data: {
        driver: 'cloudflare-kv-binding',
        binding: 'KV_DATA',
      },
      cache: {
        driver: 'cloudflare-kv-binding',
        binding: 'KV_CACHE',
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
  routeRules: {},

  future: {
    compatibilityVersion: 5,
  },

  experimental: {
    viteEnvironmentApi: false,
  },

  vite: {
    optimizeDeps: {
      exclude: ['shiki'],
    },
  },

  // Shiki highlighting for mdc-rendered content (npm migration guides via mdxg).
  // `shikiEngine: 'javascript'` uses Shiki's JS regex engine instead of the
  // Oniguruma WASM engine, which Cloudflare workerd can't load at SSR time —
  // this lets the mdxg highlighter run server-side (see modules/mdxg). `diff`
  // is the dominant lang in the guides and is NOT in mdc's default set, so it
  // must be listed explicitly. Dual theme keys (light/dark) emit per-span
  // `--shiki-light`/`--shiki-dark` CSS vars consumed in app/assets/css/main.css.
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
        exclude: ['/skills/**', '/gh/**', '/people/**', '/@**', '/admin/**', '/me/**', '/login', '/onboarding/**', '/collections/new', '/guides/**'],
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
      // `orgs` removed: it listed every owner hub (/gh/<owner>) unconditionally,
      // but those pages render noindex,follow. Advertising noindex URLs in the
      // sitemap was the bulk of GSC "Crawled – currently not indexed" (~8k) and
      // the sitewide quality demotion. /orgs/* still 301s to /gh/* for link equity.
      tags: {
        sources: ['/api/__sitemap__/tags'],
        includeAppSources: false,
      },
      guides: {
        sources: ['/api/__sitemap__/npm-guides'],
        includeAppSources: false,
      },
    },
  },

  sentry: {
    enabled: process.env.NODE_ENV === 'production',
    org: 'harlan-zw',
    project: 'skilld',
    authToken: process.env.SENTRY_AUTH_TOKEN,
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
