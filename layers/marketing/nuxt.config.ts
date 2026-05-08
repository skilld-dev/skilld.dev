// Marketing layer: SEO content. Owns /skills (marketing index), /skills/guide,
// /skills/official, /skills/stats, /frameworks/*, /accessibility.
// See docs/adr/0001-url-pillars-and-layers.md
export default defineNuxtConfig({
  modules: ['@nuxt/content'],

  routeRules: {
    '/nuxt': { redirect: { to: '/frameworks/nuxt', statusCode: 301 } } as any,
  },
})
