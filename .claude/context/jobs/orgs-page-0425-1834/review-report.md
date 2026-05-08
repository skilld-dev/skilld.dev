---
verdict: FAIL
failed_criteria: [C12]
failed_files: ["app/pages/orgs/[owner].vue:273-279", "app/app.config.ts:30-38"]
categories: [contrast, accessibility]
---

## FAIL — 2026-04-25

### Contract Scorecard (25 criteria)

- ✅ PASS [C1]: `/orgs/obra` and `/orgs/anthropics` both render display name, handle, avatar, skills (curl + browser).
- ✅ PASS [C2]: GitHub button has `target="_blank" rel="noopener"` and aria-label.
- ✅ PASS [C3]: Single-repo install (verified on `/orgs/0froq`): copy button click flips `aria-label` from "Copy install command" → "Copied" within 200ms.
- ✅ PASS [C4]: All 165 skill cards on anthropics resolve to real `<a href="/skills/...">` anchors (verified via DOM query).
- ✅ PASS [C5]: Multi-repo subheader anchors link to `https://github.com/{owner}/{repo}` with proper aria-label.
- ✅ PASS [C6]: Website button on obra renders with `http://fsck.com` (blog from GitHub API).
- ✅ PASS [C7]: Pending state markup with `aria-busy="true"` and 5 USkeleton blocks present in template.
- ✅ PASS [C8]: `/orgs/this-owner-does-not-exist-zzz123` SSR shows "Couldn't find that owner" h1, "Back to skills" link, "Retry" button.
- ✅ PASS [C9]: Error path shares the same template branch as not-found (handled by `v-else-if="error || !data"`).
- ✅ PASS [C10]: At 375px on `/orgs/obra`, no horizontal scroll. Layout stacks via `flex-col … sm:flex-row`.
- ✅ PASS [C11]: At 768px+, avatar sits left, skill grid uses `sm:grid-cols-2 lg:grid-cols-3`.
- ❌ FAIL [C12]: **Color contrast violates WCAG AA on `kind=user` profiles.** axe-core: kind badge ("person") has computed contrast ratio **4.19:1** (rose-500 `#d7003f` on `bg-primary/10` ≈ `#f7dfe3`, 8px font-size). AA requires 4.5:1 for normal text. Borders, body text, and hero text are all fine in dark mode and otherwise — the failure is isolated to the kind badge for user-kind owners. anthropics page (neutral badge) does not have this issue.
- ✅ PASS [C13]: Exactly one `<h1 id="org-heading">`. All interactive elements have aria-labels (anchors, copy buttons, GitHub/Website buttons). Tab order: skip-link → header → hero → install → skills.
- ✅ PASS [C14]: SSR HTML for `/orgs/obra` contains `Jesse Vincent`, `@obra`, "Mostly · frontend, design, documentation", and skill names before any JS hydration.
- ✅ PASS [C15]: anthropics: avatar `class="rounded-lg …"`, badge text `org`.
- ✅ PASS [C16]: obra: avatar `class="rounded-full …"`, badge text `person`.
- ✅ PASS [C17]: Title `Jesse Vincent (@obra) skills | skilld` (44 chars). Anthropics: `Anthropic (@anthropics) skills | skilld` (40 chars).
- ✅ PASS [C18]: Description `55 agent skills curated by Jesse Vincent on skilld. Frontend, Design, Documentation.` includes count, kind verb, and 3 fingerprint topics.
- ✅ PASS [C19]: `<link rel="canonical" href="https://skilld.dev/orgs/obra">` (lowercased, no trailing slash).
- ⚠️ PARTIAL [C20]: `defineOgImage('Curator.takumi', …)` is wired but the `skillCount` and `collectionCount` reactive params resolve to `0` on initial SSR for non-bot user agents because `useFetch` is `lazy: !isBot.value`. Bot crawlers see correct values; first-load social previews from non-bots may show 0. Self-assessment correctly flagged this; consistent with the same pattern on `/people/[handle]`.
- ✅ PASS [C21]: JSON-LD `Person` (obra) / `Organization` (anthropics) graph rendered SSR with `name`, `url`, `image` (ImageObject with width/height), `sameAs` (github + blog), `description`. Plus `CollectionPage` with `hasPart` (verified, includes `SoftwareApplication` entries).
- ✅ PASS [C22]: All skill links are `<a href="/skills/…">` (verified DOM `allAreAnchors: true` across 165 skills).
- ✅ PASS [C23]: `/__sitemap__/orgs.xml` returns **9423 entries**, one per distinct registry owner. Exclude rule for `/orgs/**` added in `nuxt.config.ts`.
- ✅ PASS [C24]: H1 (org name) → H2 (Install / Skills) → H3 (per-repo when grouped). No skipped levels.
- ✅ PASS [C25]: `<img alt="Avatar for Jesse Vincent">` / `alt="Avatar for Anthropic"`. Uses display name, not the literal "avatar".

### Self-Assessment Comparison

- Generator confidence: medium.
- Generator's stated weakest area: **OG image params reading 0 on SSR for non-bot UAs** — independently confirmed (C20 is partial as marked, and SSR fetch is `lazy: !isBot.value`).
- Generator's actual blind spot: **kind badge contrast on user profiles**. C12 was marked "met"; in reality `kind=user` fails AA at 4.19:1. **Self-assessment failure on C12.**
- Hardest decision (avatar shape only) holds up — the `rounded-full` vs `rounded-lg` differentiation is the only kind-specific divergence and reads correctly.

### Issues Found

#### [HARD REJECT] Contrast: kind badge fails WCAG AA on user-kind profiles
- **File**: `app/pages/orgs/[owner].vue:273-279`
- **Evidence**: axe-core serious violation: `<span data-slot="label" class="truncate">person</span>` — contrast 4.19:1, expected ≥ 4.5:1. Foreground `#d7003f` (rose-500), background `#f7dfe3` (bg-primary/10), font-size 8px.
- **Contract criterion violated**: C12 ("contrast remains AA").
- **Root cause is design-system-level**, not page-level: project-wide UBadge `size="xs"` config in `app/app.config.ts:30-38` produces `text-[8px]/3` for all xs badges, and `variant="subtle"` `color="primary"` (rose) + 8px text combination is below AA. The page correctly uses semantic tokens; the tokens themselves don't meet AA at this size. Design guidelines `.claude/context/design-guidelines.md:63` already flags this: *"Known risks: rose on warm stone surfaces needs contrast verification for small text badges"* — known risk, never resolved.
- **Fix path**: either (a) bump xs badge font-size to ≥ 10px (acceptable for AA Large at 3:1 if mass / 4.5:1 normal), or (b) keep `variant="solid"` `color="primary"` (white-on-rose at 6:1+) for the kind badge, or (c) on this page only, override `class` with explicit color tokens that pass AA. Option (b) is most aligned with the contract's "rose accent only on kind badge tinting" intent and would be a one-prop change.

### What was verified

- Dev server health: `curl /orgs/obra` → 200 (83ms cached); `curl /orgs/anthropics` → 200; `curl /orgs/this-owner-does-not-exist-zzz123` → 200 with empty-state SSR; sitemap → 200, 9423 entries.
- DOM structure via `dev-browser`: anchor counts, h1/h2/h3 hierarchy, badge classes, avatar shape per kind, copy button click → aria-label flip.
- a11y: axe-core run on both `/orgs/obra` and `/orgs/anthropics`. obra has the contrast violation above; anthropics is clean (only an unrelated fixed-position dev-tools indicator).
- Mobile viewport (375×812): no horizontal scroll on either page.
- Dark mode: toggled via `documentElement.classList.add('dark')`; no hardcoded hex; semantic tokens (`bg-default`, `bg-muted`, `border-default`) carry through.
- SSR identity strings present in raw HTML (curl, no JS) for both display name and handle.
- Schema.org: Person for `kind=user`, Organization for `kind=org` — verified in `application/ld+json` graph.
- Mechanical greps clean: no TODO/Lorem/Coming soon, no hardcoded hex, no slate/gray/zinc/stone tokens, no white/black, no font-inter/roboto.
- Tab order spot-check: focusables in order skip-link → header nav → hero buttons.
- Sitemap `/__sitemap__/orgs.xml`: confirmed 9423 `<loc>` entries.

### Out-of-scope observations (not blockers)

- **Dev D1 binding intermittent**: while writing this review, the dev wrangler D1 port (`127.0.0.1:44857`) dropped, causing `/api/skills`, `/api/skills/featured`, and any uncached `/api/orgs/*` to return 500 with `fetch failed ECONNREFUSED`. The cached `/orgs/obra` and `/orgs/anthropics` continued to serve from KV. Pre-existing dev infra issue, not caused by this build. Restart `pnpm dev` to recover.
- **`/skills` page link wiring (`View profile →`, featured-section avatars to `/orgs/{owner}`)**: source diff is correct (`app/pages/skills/index.vue:475-501`), but I could not verify rendered DOM during this review window because the featured-sections SSR was failing on the dead D1 port. The diff is straightforward enough that source review is sufficient.
- **Stale `build-progress.md`**: notes claim "Single-repo install command (visible on obra; absent on anthropics, correct)". Wrong: obra has 9 repos and renders the multi-repo grouped layout (no install heading). The handoff schema state is otherwise accurate.

### Next Steps

> Run `/nuxt-frontend-design orgs-page-0425-1834` to fix C12. The contrast issue is design-system-level: the simplest fix is to swap the kind badge from `variant="subtle" color="primary"` to `variant="solid" color="primary"` (or alternative tokens that pass AA). Verify the fix doesn't break the anthropics page's `color="neutral"` branch.
>
> Then re-run `/nuxt-frontend-review orgs-page-0425-1834` to verify.

### Decision Log

- **C12 (contrast)**: I considered marking this PARTIAL on the grounds that the underlying tokens are pre-existing project config and not a regression introduced by this build. Rejected: the build introduced a *new* surfacing of the failing pattern (kind badge for user profiles). The contract explicitly required AA. Hard reject per rubric "Unreadable text: contrast ratio below 4.5:1 on any text element."
- **C20 (OG image)**: kept as PARTIAL rather than FAIL because (a) the contract phrasing focuses on schema validity, not bot-vs-user rendering, (b) the same lazy-fetch pattern is in place on `/people/[handle]` and the team has explicitly accepted it, and (c) bot crawlers (Twitter/Facebook scrapers, Googlebot) see correct counts.
- **/skills SSR failure**: ruled out as a build regression after confirming `/api/orgs/{owner}` (uncached) and `/api/skills` (pre-existing) both fail identically with the same ECONNREFUSED — a wrangler/miniflare dev port issue, not code.
- **Suspicion check**: re-examined avatar fallback (no fallback if GitHub returns 404 — but `data.avatar` is constructed from `https://github.com/${owner}.png` which returns a generic GitHub avatar even for non-existent users, and the empty-state branch fires before this is rendered for unknown owners). Re-examined copy button overlay z-index (z-10, opacity-0 default, group-hover:opacity-100, focus-visible:opacity-100 — keyboard reachable). Re-examined `ensureProtocol` (handles bare host blogs like `fsck.com`). All three held up.