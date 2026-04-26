export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxt/scripts',
    '@nuxtjs/seo',
    '@nuxt/a11y',
    '@nuxtjs/html-validator',
    'motion-v/nuxt',
    '@vueuse/nuxt',
    './modules/oauth',
    'nitro-cloudflare-dev',
  ],

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
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || '',
    adminSecret: process.env.NUXT_ADMIN_SECRET || '',
    public: {
      algolia: {
        appId: 'OFCNCOG2CU',
        apiKey: 'f54e21fa3a2a0160595bb058179bfb1e',
        indexName: 'npm-search',
      },
    },
  },

  nitro: {
    preset: 'cloudflare-durable',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: 'skilld-dev',
        compatibility_flags: ['nodejs_compat', 'no_nodejs_compat_v2'],
        kv_namespaces: [
          { binding: 'KV_CACHE', id: '187e636458cb49faa2ae14743adc7736' },
          { binding: 'KV_DATA', id: 'cf3d794a55f84192a30f520686e1d932' },
        ],
        d1_databases: [
          { binding: 'DB', database_name: 'skilld-db', database_id: 'a5e53f35-f5e5-4987-8c67-c0175addc7cc' },
        ],
        durable_objects: {
          bindings: [
            { name: '$DurableObject', class_name: '$DurableObject' },
          ],
        },
        migrations: [
          { tag: 'v1', new_classes: ['$DurableObject'] },
        ],
        observability: {
          logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
        },
      },
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
      websocket: true,
      wasm: true,
    },
    scheduledTasks: {
      '*/10 * * * *': ['refresh-curators'],
      '*/15 * * * *': ['refresh-follows'],
      '0 * * * *': ['sync-github-skills'],
    },
  },

  routeRules: {
    '/': { swr: 300 },
  },
  future: {
    compatibilityVersion: 5,
  },

  experimental: {
    viteEnvironmentApi: false,
  },

  compatibilityDate: '2026-03-03',

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
    collections: ['lucide'],
  },

  sitemap: {
    sitemaps: {
      pages: {
        includeAppSources: true,
        exclude: ['/skills/**', '/people/**', '/orgs/**'],
      },
      skills: {
        sources: ['/api/__sitemap__/skills'],
        includeAppSources: false,
        chunks: 10000,
      },
      people: {
        sources: ['/api/__sitemap__/people'],
        includeAppSources: false,
      },
      orgs: {
        sources: ['/api/__sitemap__/orgs'],
        includeAppSources: false,
      },
    },
  },
})
