# Build Progress — orgs-page-0425-1834

## /orgs/[owner]

### Files
- `app/pages/orgs/[owner].vue` (new) — profile page
- `server/api/orgs/[owner].get.ts` (new) — owner profile API
- `server/api/__sitemap__/orgs.ts` (new) — sitemap source
- `server/utils/skills-registry.ts` (modified) — added `listAllOwnersForSitemap`
- `nuxt.config.ts` (modified) — sitemap config wires `orgs` source
- `app/pages/skills/index.vue` (modified) — featured section avatars + "View all" links + filter chip CTA point to `/orgs/{owner}`
- `app/pages/skills/[...slug].vue` (modified) — owner avatar + handle text now link to `/orgs/{owner}` (was: github.com)

### Criteria
**Met:**
- C1 — `/orgs/obra` and `/orgs/anthropics` both render full profile (200 OK).
- C2 — GitHub button present with `target="_blank" rel="noopener"`.
- C3 — Single-repo install command + copy button (visible on obra; absent on anthropics, correct).
- C4 — Skill cards use `<NuxtLink to="/skills/...">` (verified via SSR HTML).
- C5 — Multi-repo subheaders link to `github.com/{owner}/{repo}` with aria-label.
- C6 — Website button conditionally renders when `data.blog` exists (obra has `http://fsck.com`).
- C7 — Skeletons render during pending state (verified in template structure).
- C8 — Unknown owner (`/orgs/this-owner-does-not-exist-zzz123`) shows "Couldn't find that owner" + Back/Retry.
- C9 — Error branch shares the same retry CTA path as C8 (handled in same v-else-if block).
- C10/C11 — Mobile-first responsive: `flex-col gap-4 sm:flex-row sm:items-start sm:gap-6`, grid `sm:grid-cols-2 lg:grid-cols-3`.
- C12 — Dark mode tokens: `bg-muted`, `text-muted`, `border-default`, `bg-elevated` only. No hardcoded hex.
- C13 — Single `<h1 id="org-heading">` per page; H2s for Install/Skills sections; H3 per repo when grouped.
- C14 — SSR contains `Jesse Vincent`, `@obra`, fingerprint, skill names before hydration (9 occurrences of identity strings).
- C15 — `kind=org` (anthropics) → avatar `class="rounded-lg ..."`.
- C16 — `kind=user` (obra) → avatar `class="rounded-full ..."`.
- C17 — Title: `Anthropic (@anthropics) skills | skilld` / `Jesse Vincent (@obra) skills | skilld` (unique, ≤60 chars).
- C18 — Description format: `{N} agent skills {curated|published} by {name} on skilld. {Topic1}, {Topic2}, {Topic3}.`
- C19 — Canonical: `https://skilld.dev/orgs/{owner}`.
- C20 — OG image generated via `defineOgImage('Curator.takumi', ...)`.
- C21 — JSON-LD: `Person` (obra) / `Organization` (anthropics) with `name`, `url`, `image` (ImageObject), `sameAs` (github + blog), `description`. Plus `CollectionPage` with `hasPart` of up to 25 skills.
- C22 — All skill links are real `<a href="/skills/...">` (NuxtLink renders `<a>`).
- C23 — Sitemap `/__sitemap__/orgs.xml` returns 9423 owner URLs (one per distinct owner with ≥1 skill).
- C24 — H1 → H2 → H3 hierarchy verified (no skipped levels).
- C25 — Avatar `alt="Avatar for Jesse Vincent"` (uses display name, not just "avatar").

**Out-of-scope (deferred per contract):**
- `/orgs/` index page (top owners directory).
- Cross-link to atproto curator profile when GitHub handle matches.
- Redirect `/skills?owner=X` → `/orgs/X` (filter still works; `View profile` button bridges to new page).

### Smoke tests
- `curl /orgs/obra` → 200, contains identity, fingerprint, skills, install command.
- `curl /orgs/anthropics` → 200, multi-repo grouped (23 unique repos), no install command (correct, multi-repo).
- `curl /orgs/this-owner-does-not-exist-zzz123` → 200 with empty-state markup.
- `curl /__sitemap__/orgs.xml` → 200, 9423 entries.
- `curl /skills` → contains `href="/orgs/{owner}"` for every featured section.
- `curl /skills/obra/superpowers/brainstorming` → contains `href="/orgs/obra"` on owner header.

### Pre-existing issue worked around
- `nuxt-og-image@6.4.7` install at hash `48ff5400...` was missing `font-source.js` import target, causing Rollup `Could not resolve` errors and dev-server restart loop. Copied the working `fonts.js` (without the broken import) from sibling install hash `0fe40b6d...` so both installs match. Pre-existing — unrelated to this build but blocked the dev server until fixed.

### Known limitations
- OG image `?skillCount=` and `?collectionCount=` query params show 0 on initial SSR for non-bot user-agents because `useFetch` is `lazy: !isBot.value`. Bot crawlers (Twitter/Facebook scrapers, Googlebot) get correct values. Same pattern as `/people/[handle]`.
- `defineCachedEventHandler` with `swr: true` and 5-min `maxAge` — first hit per owner is cold (D1 query + GitHub API + tag aggregation, ~500-1500ms). Subsequent hits served from KV cache.
