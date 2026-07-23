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
    cron: true,
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

  icon: {
    serverBundle: 'local',
    collections: ['lucide', 'vscode-icons', 'simple-icons'],
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
