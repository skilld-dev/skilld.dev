export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxtjs/seo',
    '@nuxt/a11y',
    '@nuxtjs/html-validator',
    'motion-v/nuxt',
    '@vueuse/nuxt',
    './modules/oauth',
  ],

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
  },

  routeRules: {
    '/': { prerender: true },
  },
  future: {
    compatibilityVersion: 5,
  },

  compatibilityDate: '2025-03-28',

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

  ogImage: {
    enabled: false,
  },
})
