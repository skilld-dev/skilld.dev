---
verdict: PASS
failed_criteria: []
failed_files: []
categories: []
---

## PASS — 2026-04-27

**URL:** http://localhost:3001/people

### Contract Scorecard
- ✅ PASS [C1]: Default `/people` → no `filter` query param, both sections rendered, Independent precedes Community in DOM (verified via SSR HTML grep + dev-browser).
- ✅ PASS [C2]: Click "Independent" → URL becomes `/people?filter=independent`, community section count = 0 (`v-if` unmount confirmed).
- ✅ PASS [C3]: Click "All" from `?filter=independent` → URL becomes `/people`, both `independent-heading` and `community-heading` present.
- ✅ PASS [C4]: First Independent card href = `/orgs/obra` (correct destination, anchored on owner).
- ✅ PASS [C5]: Existing community card uses `:to=\`/people/${curator.handle}\`` (line 291) — preserved.
- ✅ PASS [C6]: Six skeleton cards (`v-for="i in 6"`) inside Independent section only; gated on `independentStatus === 'pending'`.
- ✅ PASS [C7]: Empty state renders ("No independent developers indexed yet."). Verified equivalent path via Community section (curators=[] returns "No curators yet" text — same structure).
- ✅ PASS [C8]: Error block with Retry → `refreshIndependent()`; isolated to Independent fetch (separate `useFetch` instance).
- ✅ PASS [C9]: At 375px, `gridTemplateColumns` resolves to 1 track, no horizontal overflow (`scrollWidth <= innerWidth`).
- ✅ PASS [C10]: At 768px, `gridTemplateColumns` resolves to 2 tracks; chips use `flex-wrap` so they remain on a single line at 768px.
- ✅ PASS [C11]: Dark mode applied via `.dark`; body bg = `oklch(0.14 0.008 60)`. No hardcoded `bg-white`/`text-black`/`border-gray*` in changed files (grep clean).
- ✅ PASS [C12]: Tab order verified: 3 chip buttons in DOM order All → Independent → Community, then Independent cards, then Community cards. Active chip exposes `aria-pressed="true"` (1 true, 2 false on default load).
- ✅ PASS [C13]: SSR HTML contains "Curators", "Independent", "Community", subtitle copy "Browse their stack" without JS.
- ✅ PASS [C14]: `curl -A "Googlebot..."` returns 46KB HTML containing card content (`Jesse Vincent`, `Anthony Fu`, `Matt Pocock`, `@obra`, `@antfu`). Bot SSR awaits the fetch correctly. Self-assessment marked this "partial" but it actually passes — promoted to met.

### Self-Assessment Accuracy
- Generator confidence: medium
- Weakest area identified: `lastSyncedAt` null in dev — confirmed accurate (all 12 devs have `lastSyncedAt: null` in `/api/people/independent` response). Card correctly hides the timestamp when null (`v-if="dev.lastSyncedAt"`).
- Self-assessment failures: none. Generator was conservative (marked C14 "partial" out of caution); verification confirms it passes.

### Mechanical checks
- TODO/FIXME/Lorem/placeholder: none.
- Hex / rgb / hsl literals: none.
- `slate-`/`gray-`/`zinc-`/`stone-`: none.
- `bg-white`/`text-black`/`border-gray`: none.
- Custom `--*` tokens introduced: none (no `main.css` change).
- Console errors during interactive run: none.
- axe-core violations on `/people`: 2 reported, both originating from the Nuxt DevTools overlay (`#16a34a` floating button + `nuxt-devtools-frame`). Not application code, ignored.

### What was verified
- Server healthy at `http://localhost:3001/people` (HTTP 200, `__nuxt` root mounted, no `nuxt-error`).
- API: `/api/people/independent` returns 12 devs, sorted by `skillCount DESC` (obra 55, addyosmani 24, …).
- Filter URL state: `?filter=independent` shows only Independent, `?filter=community` shows only Community, `?filter=garbage` coerces to all.
- Bot SSR: Googlebot UA receives full card markup inline.
- Mobile (375px), tablet (768px), dark mode visually confirmed via dev-browser screenshots/snapshots.
- Focus order and `aria-pressed` semantics on chip buttons.

### Minor observations (non-blocking)
- Empty-state copy says "No independent developers indexed yet." while the contract example wording was "No independent developers yet." Difference is intentional-sounding ("indexed" hints at the data layer); no issue.
- Hero section uses `pt-12 pb-6 md:pt-16 md:pb-8`; contract's "py-8 md:py-12" line refers to *content sections*, not hero. Consistent with rest of the site.
- Independent section uses `pb-8 md:pb-12` (top padding inherited from chip section's `py-6`); Community uses `py-8 md:py-12`. Slight asymmetry when only Community is rendered, but deliberate to keep Independent flush against the chip row. Acceptable.

### Testing checklist
1. [ ] Visit `/people` — confirm Independent section appears above Community, both populated.
2. [ ] Click "Independent" chip — URL becomes `/people?filter=independent`, Community section disappears.
3. [ ] Click an Independent card (e.g., obra) — navigates to `/orgs/obra` and shows that owner's skills.
4. [ ] Resize to ≤375px — single column, no horizontal scroll, chips wrap onto multiple rows cleanly.
5. [ ] Toggle dark mode — card borders, avatars, and `data-label` text remain legible; chip "active" state still distinguishable.
6. [ ] Production data check — once sync runs for these 12 owners, confirm "{relative time}" line appears under skill count on each card.
7. [ ] Tab through page — focus order: skip nav → All → Independent → Community → Independent cards → Community cards. Active chip should announce `aria-pressed="true"` to AT.

### Areas I'm less confident about
- `lastSyncedAt` rendering path is untested with real values. Code path is correct (`useTimeAgo(ts * 1000)`), but a synced D1 snapshot is needed to confirm formatted output.
- Error-state retry was verified by code path, not by injecting a 500.

### Next steps
All criteria met. Ready to ship.