export default defineNuxtConfig({
  routeRules: {
    '/admin/**': { robots: false } as any,
  },
})
