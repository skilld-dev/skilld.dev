# Progress — people-independent-0427-0854

## /people Independent + Community split

**Files**
- `server/api/people/independent.get.ts` — created
- `app/components/PeopleIndependentCard.vue` — created
- `app/pages/people/index.vue` — modified

**Contract criteria status**
- C1 met (default URL has no filter param; both sections render in DOM order Independent → Community)
- C2 met (`navigateTo({ query: { filter: 'independent' } }, { replace: true })`; `v-if="showCommunity"` unmounts community)
- C3 met (clicking All clears the query)
- C4 met (cards wrap `<NuxtLink :to="/orgs/{owner}">`, verified via curl: `href="/orgs/addyosmani"` etc.)
- C5 met (community grid unchanged, links to `/people/{handle}`)
- C6 met (per-section pending block with 6-card skeleton)
- C7 met (per-section empty block with `i-lucide-users`)
- C8 met (per-section error block with `Retry` calling `refreshIndependent()`)
- C9 met (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; chip row uses `flex flex-wrap gap-2`)
- C10 met (same grid utilities; chips fit on one line at 768px)
- C11 met (uses `bg-muted`, `text-muted`, `border-default`, `bg-default` only — no hardcoded grays)
- C12 met (`role="group"`; `aria-pressed` toggles per chip; verified 1 true / 2 false in HTML)
- C13 met (curl /people confirms `Independent`, `Community`, `Browse their stack`, chip filter labels in markup)
- C14 partial (bot SSR awaits both fetches via `lazy: !isBot.value`; the existing pattern, not separately verified with bot UA)

**Verification done**
- `curl /api/people/independent` returns 12 devs, sorted skillCount DESC
- `curl /people` HTTP 200, no html-validate errors
- `curl /people?filter=independent` HTTP 200, Community section absent
- `curl /people?filter=community` HTTP 200, Independent section absent
- `curl /people?filter=garbage` coerces to `all`, both sections render
- `aria-pressed`: 1 true / 2 false on filter chips

**Known limitations**
- `lastSyncedAt` is null for all 12 devs in local D1 state (sync not run); card hides the timestamp via `v-if="dev.lastSyncedAt"`. Production data should populate this.
- `displayName` falls back to handle for 8/12 devs (cached profile not yet warmed). Hits the `github:profile:{owner}` cache populated by visits to `/orgs/{owner}`. Hot-load the cache by visiting each org page or rely on the 6-hour TTL backfill via SWR.
