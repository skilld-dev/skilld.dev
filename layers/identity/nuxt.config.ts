// Identity layer: atproto auth, OAuth, DID resolution, social graph.
// See docs/adr/0001-url-pillars-and-layers.md
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [fileURLToPath(new URL('./modules/oauth.ts', import.meta.url))],
})
