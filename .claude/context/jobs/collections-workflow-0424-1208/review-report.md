---
verdict: PASS
failed_criteria: []
failed_files: []
categories: []
---

## PASS — 2026-04-24

### Contract Scorecard

- ✅ PASS [C1]: SSR response contains `<h1 id="collections-heading">Collections</h1>` and editorial intro before hydration (verified via curl).
- ⚠️ PARTIAL [C2]: grid + card template verified by code review; 0 published collections on the site so live rendering of real cards was not exercisable (self-assessment called this out).
- ✅ PASS [C3]: browse-stage CTA click live-opened the auth modal; `sessionStorage.getItem('skilld:post-auth-intent')` === `'new-collection'` confirmed via dev-browser.
- ✅ PASS [C4]: `handleClick` in `CollectionsEmptyCTA.vue:14-17` routes non-browse stages to `/collections/new`.
- ✅ PASS [C5]: `grid-cols-1 md:grid-cols-2` applied; mobile viewport check @ 375px shows no horizontal overflow.
- ✅ PASS [C6]: `md:grid-cols-2` applied.
- ✅ PASS [C7]: all colors token-based (`border-default`, `text-muted`, `bg-muted`). axe contrast passes for page content in both light and dark (the one flagged node is the Nuxt DevTools overlay, not app content).
- ✅ PASS [C8]: verified live — clicking CTA in browse stage wrote `skilld:post-auth-intent=new-collection` and opened modal.
- ✅ PASS [C9]: `navigateTo('/collections/new')` on non-browse.
- ✅ PASS [C10]: same path for published/curator.
- ✅ PASS [C11]: `watchEffect` in `app/pages/collections/new.vue:11-14` redirects authed users to `/people/{handle}/collections/new`.
- ✅ PASS [C12]: anon view shows "Connect with your Atmosphere account" button; click opens modal (live-verified).
- ✅ PASS [C13]: `app/plugins/post-auth-intent.client.ts` watches auth state, reads intent, navigates to `/people/{handle}/collections/new`.
- ✅ PASS [C14]: lexicon validates `preamble?: string ≤5000`; editor writes `state.preamble` when non-empty.
- ✅ PASS [C15]: `app/pages/people/[handle]/[slug].vue:168-189` renders a `section[aria-labelledby="preamble-heading"]` above the skills list when preamble is present.
- ✅ PASS [C16]: `metaExcerpt()` prefers preamble (stripped of markdown tokens) for `<meta name="description">`.
- ✅ PASS [C17]: `metaExcerpt(undefined, description)` path falls through to existing description; preamble block is `v-if`-gated.
- ✅ PASS [C18]: homepage empty state replaced with `<CollectionsEmptyCTA />`; live SSR shows the shared copy.
- ✅ PASS [C19]: "View all" button on homepage collections section has `to="/collections"` (conditional on `homepageData?.collections.length`; couldn't live-test with 0 collections).
- ✅ PASS [C20]: desktop + mobile nav show Collections link between Skills and Curators (see deviation note below).
- ✅ PASS [C21]: live curl confirms `<title>Collections — skilld ...</title>`, `<meta name="description" content="Curated bundles...">`, `<meta property="og:image" content=".../Collections directory on skilld...">`.
- ⚠️ PARTIAL [C22]: tab order structurally correct (logical: skip-link → header → hero → sections → footer). No negative tabindex, no focus traps. Visible focus rings are from Nuxt UI defaults. Not deep-tested with live keyboard walking end-to-end.

### Self-Assessment Comparison

- Generator confidence: **medium** — honest.
- Weakest area identified: "Featured/recent split not live-tested (0 collections), post-auth round-trip not end-to-end." — **accurate**.
- No self-assessment failures: every "met" grade I could live-test held up.
- Hardest decision (curator label ranking as follower-count proxy) is plausible given the memory constraint and the data actually available server-side.

### Issues

No hard rejections. Two non-blocking notes:

#### [SCOPE DEVIATION] Nav: Guide Skills link removed from header
- **File**: `app/app.vue:91-108, 161-176`
- **Evidence**: diff replaces `label="Guide Skills" to="/skills/guide"` with `label="Collections" to="/collections"` and renames `NPM Skills` → `Skills`. The contract said "Add 'Collections' link ... between NPM Skills and Curators" — this is an *add*, not a *replace*. `/skills/guide` still exists as a route but is no longer linked from the header. Worth confirming the Guide Skills removal was intentional; if not, restore it (the page was 237 lines trimmed to ~237 in this branch, so the page itself still exists).
- **Contract criterion**: C20 literal text satisfied, but scope widened beyond contract.

#### [RUBRIC] DRY: duplicated `preambleExcerpt` helper
- **File**: `server/api/homepage.get.ts:22-29` and `server/api/collections/index.get.ts:27-34`
- **Evidence**: identical function body (strip markdown chars, collapse whitespace, slice to N with last-word trim) defined twice. Also duplicated as `metaExcerpt` in `app/pages/people/[handle]/[slug].vue:31-38` with the same regex and a different constant. Hoist to a single `server/utils/text/excerpt.ts` (and import into the page component if appropriate).

### What was verified

- Dev server on `:3004` returned 200 for `/`, `/collections`, `/collections/new`.
- SSR asserts: `<h1 id="collections-heading">`, correct `<title>`, `<meta name="description">`, `<meta property="og:image">`, `noindex` on `/collections/new`.
- Live browser via dev-browser:
  - `/collections` empty-state CTA → modal opened, sessionStorage intent set.
  - `/collections/new` anon CTA → modal opened, sessionStorage intent set.
  - Homepage empty-state CTA → modal opened, sessionStorage intent set.
  - Nav order: `skilld | Skills | Collections | Curators | Sign in`.
  - Mobile 375px on `/collections`: no overflow.
  - Dark mode toggled: no additional violations.
- axe-core on `/collections` light + dark: 0 app-level violations (only Nuxt DevTools overlay flagged, ignored).
- Mechanical greps (hex, rgb, gray/slate/zinc/stone, bg-white/text-black, custom tokens): all clean on the new files.
- Lexicon + editor + detail-page preamble wiring traced end-to-end in code.

### What I couldn't verify live

- Card rendering with real data (0 published collections on the server; `/api/collections` returns empty).
- Featured vs recent ordering (no data).
- Full OAuth round-trip for post-auth-intent plugin.
- Full keyboard-only tab walk (dev-browser focused on interaction rather than live tab sequencing).

### Testing checklist

1. [ ] Publish a real collection with a ~400-char preamble. Verify the detail page renders the preamble block and `<meta name="description">` is the first ~160 chars, markdown-stripped.
2. [ ] Publish a second collection without a preamble. Verify detail page meta falls back to `description` and no preamble block renders.
3. [ ] Open `/collections` with ≥2 collections. Verify featured/recent split and that each card links to `/people/{handle}/{slug}`.
4. [ ] Tab through `/collections` from address bar. Focus order: skip-link → header → h1/hero → Featured cards → Recent cards → CTA publish → footer. Visible focus rings everywhere.
5. [ ] Sign out → click "Publish a collection" on homepage empty state → complete OAuth → verify you land on `/people/{your-handle}/collections/new` (post-auth-intent plugin).
6. [ ] Confirm the Guide Skills nav removal was intentional. If not, re-add a `/skills/guide` link.
7. [ ] `/collections/new` while signed in: verify silent redirect to `/people/{handle}/collections/new` (no flash of the sign-in card).

### Next Steps

All contract criteria met. Ready to ship once items 1-3 and 5 on the checklist are live-validated with real data. Consider:

- Centralize the three duplicated excerpt helpers into one util (minor tidy).
- Decide intent on the Guide Skills nav removal; restore if the removal was unintentional scope creep.

### Decision Log

- **Contrast violations**: axe flagged `#ffffff on #16a34a at 3.29:1` — traced to Nuxt DevTools `nuxt-devtools-frame` fixed overlay, not page content. Ignored.
- **Region violations**: same, DevTools overlay.
- **C2 as PARTIAL not FAIL**: code-path and template are correct; only blocker is absence of real data, which is a content issue not a code issue.
- **C22 as PARTIAL not FAIL**: structural tab order is sound and focus rings are present; a full manual keyboard walk in the browser was not executed. Not enough to fail.
- **Nav deviation graded as PASS + scope note**: C20's literal requirement ("Collections link visible between Skills and Curators") is met. The uncommissioned removal of `/skills/guide` from the nav is a scope concern, not a criterion failure. Raised in Issues for user decision.
- **DRY duplication**: three copies of the excerpt helper is a code-quality smell but does not violate any contract criterion or hard-reject rule.
