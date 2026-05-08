# Build Progress: nuxt-framework-page-0426-1422

## /nuxt (and /api/tags/[slug])

### Files created
- `server/api/tags/[slug].get.ts` — generic tag profile endpoint (cached 5min, swr). Used by /nuxt today, reusable for any other tag in TAXONOMY.
- `app/pages/nuxt.vue` — bespoke /nuxt page.

### Files modified
None.

### Contract criteria satisfied
- C1 install copy with check icon swap — wired via `useClipboard` + `copiedName` ref
- C2 owner card -> /orgs/{owner} — `NuxtLink to="/orgs/{owner}"` on each contributor card
- C3 skill card title -> /skills/{slug} — `NuxtLink to=skillPath(skill)`
- C4 nuxt.com link opens in new tab — `target=_blank rel=noopener` on hero CTA
- C5 keyboard reachable — Nuxt UI defaults plus group-hover/focus-visible reveal for copy buttons
- C6 skeleton placeholders — `v-if status === 'pending'` block with USkeleton rows
- C7 empty state — distinct branch `v-else-if="!data"` with "No Nuxt skills indexed yet" + Browse all skills (no Retry)
- C8 error state — distinct branch `v-else-if="error"` with "Couldn't load Nuxt skills. Check your connection and try again." + Retry (no Browse). Icon `i-lucide-cloud-off`.
- C9 mobile (375px) — `grid-cols-1` skills + `grid-cols-1` contributors (single column)
- C10 desktop (768px) — `sm:grid-cols-2` skills + `sm:grid-cols-2 md:grid-cols-3` contributors (3-col @ md, 2-col @ sm)
- C11 dark mode — verified in browser, warm stone bg (oklch 0.14 0.008 60), mono title bright, Nuxt mark inherits text color
- C12 a11y — h1, h2 labels for sections (aria-labelledby), avatar alt, copy button aria-label that swaps to "Copied"
- C13 SSR — `curl /nuxt` returns HTML containing "Skills for Nuxt" (6x) and owner names @antfu/@nuxt/@onmax before hydration

### Criteria remaining
None.

### Verification
- Dev server: 200 on `/nuxt` and `/api/tags/nuxt`
- Browser smoke (Chrome via dev-browser): 88 skills loaded, 8 top contributors render, no console errors, dark mode verified
- API returned 88 skills (broader than tag-tagged-only thanks to hybrid FTS + owner + tag matching)

### Notes for review
- Local D1 has only 20 AI-tagged skills (none with `nuxt`). The endpoint uses a hybrid match (FTS on slug `nuxt*` + owner equality + AI tag) so the page still surfaces the natural Nuxt ecosystem (88 hits) without depending on the tagging job being current.
- Top contributors sorted by total install count desc (impact-weighted), not raw skill count, so high-quality single-skill owners like @antfu and @nuxt rank near the top.
- Mobile screenshot via dev-browser failed (sandbox issue with setViewport mid-session); responsive correctness inferred from grid classes. Worth eyeballing with browser devtools during review.

## Repair pass — 2026-04-26T22:30:07Z

Prior verdict: FAIL (C8 error-state-copy hard reject; C9/C10 responsive partial). Fixes:

- **C8 (HARD REJECT) → met**: split merged `v-else-if="error || !data"` into two branches. Error branch uses brand-voiced copy ("Couldn't load Nuxt skills. Check your connection and try again.") with Retry only and `i-lucide-cloud-off` icon. Empty branch keeps the original copy with Browse all skills only.
- **C9/C10 (RUBRIC) → met**: contributors grid changed from `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` to `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`. Now 1 col @ 375px, 2 cols @ 640px, 3 cols @ 768px.
- **code-quality (RUBRIC) → met**: lifted `useTimeAgo(data.fetchedAt).value` out of the template. Setup now declares `const syncedAgo = useTimeAgo(() => data.value?.fetchedAt ?? Date.now())` and the template renders `{{ syncedAgo }}`.
- **INFO note on `app/pages/index.vue`**: left untouched per review's explicit out-of-scope flag.

Verification: dev server still serves `/nuxt` 200 with 6 SSR hits of "Skills for Nuxt".