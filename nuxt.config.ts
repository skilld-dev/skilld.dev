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

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  runtimeConfig: {
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || '',
    adminSecret: process.env.NUXT_ADMIN_SECRET || '',
  },

  nitro: {
    preset: 'cloudflare-durable',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: 'skilld-dev',
        compatibility_flags: ['nodejs_compat', 'no_nodejs_compat_v2'],
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
    experimental: {
      tasks: true,
      websocket: true,
      wasm: true,
    },
    scheduledTasks: {
      '*/10 * * * *': ['refresh-curators'],
    },
  },

  routeRules: {
    '/': { prerender: true },
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
    families: [
      { name: 'Plus Jakarta Sans', provider: 'google' },
      { name: 'IBM Plex Mono', provider: 'google' },
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
        exclude: ['/skills/**', '/people/**'],
      },
      skills: {
        sources: ['/api/__sitemap__/skills'],
        includeAppSources: false,
      },
      people: {
        sources: ['/api/__sitemap__/people'],
        includeAppSources: false,
      },
    },
  },
})
