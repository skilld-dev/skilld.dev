import { fileURLToPath } from 'node:url'

// Registry layer: GitHub-proxied entities (orgs, repos, skills) under /gh/*.
// See docs/adr/0001-url-pillars-and-layers.md
export default defineNuxtConfig({
  routeRules: {
    // Recorded Agent output and its screenshots, never search content.
    '/demos/**': { robots: false },
  },
  nitro: {
    // Demo output pages, bundled with the Worker and served sandboxed by
    // `server/routes/demos/[owner]/[repo]/[name]/live.get.ts`.
    serverAssets: [
      { baseName: 'skill-demos', dir: fileURLToPath(new URL('./server/demos', import.meta.url)) },
    ],
  },
})
