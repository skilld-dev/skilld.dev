// Marketing layer: SEO content. Owns /skills (marketing index), /skills/guide,
// /skills/leaderboard, /skills/official, /skills/stats, /frameworks/*,
// /accessibility.
// See docs/adr/0001-url-pillars-and-layers.md
export default defineNuxtConfig({
  modules: ['@harlan-zw/comark-content'],

  content: {
    highlight: true,
  },

  routeRules: {
    '/nuxt': { redirect: { to: '/frameworks/nuxt', statusCode: 301 } } as any,
  },
})
