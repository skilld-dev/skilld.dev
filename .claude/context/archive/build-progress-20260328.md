# Build Progress

## Homepage

**Files created/modified:**
- `app/pages/index.vue` — page orchestrator with mock data, 4 sections
- `app/components/CuratorCard.vue` — curator card with avatar, name, handle, stack badges, collection count
- `app/components/CollectionCard.vue` — collection card with curator attribution, skills, copy-to-clipboard install command
- `app/components/AppLogo.vue` — skilld wordmark in mono
- `app/app.vue` — rebranded shell (header, footer)
- `nuxt.config.ts` — added @vueuse/nuxt module
- `package.json` — added @vueuse/core, @vueuse/nuxt

**Contract criteria status:**
- C1 (hover curator card): met — border transition + glow-rose class
- C2 (browse curators CTA): met — links to #curators anchor
- C3 (copy install command): met — useClipboard with check icon confirmation
- C4 (click curator card): met — NuxtLink to /people/[handle]
- C5 (click collection title): met — NuxtLink to /people/[handle]/[slug]
- C6 (6 curator cards): met — 6 cards with all required data
- C7 (4+ collection cards): met — 4 collection cards with curator attribution
- C8 (hero with CTAs): met — title, description, 2 buttons
- C9 (375px single column): met — verified no overflow
- C10 (768px 2-column): met — sm:grid-cols-2 on curators, md:grid-cols-2 on collections
- C11 (warm dark mode): met — OKLCH backgrounds with chroma >0
- C12 (keyboard focus): met — using Nuxt UI default focus ring behavior
- C13 (SSR content): met — all content in template, no client-only wrapping

Browser check: PASS (hasContent: true, hasNuxtError: false, mobileOverflows: false)
