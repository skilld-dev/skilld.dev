# Build Contract — Independent devs on /people

Job: `people-independent-0427-0854`
Confirmed answers (from /people plan):
- Chip labels: **Independent / Community**
- Default filter: **All, mixed** (Independent first when All)
- Hero copy: `Developers who curate agent skill collections. Browse their stack, follow their taste.`
- Install snippet on cards: **No** (click through to /orgs/{owner})

## What will be built

### Server
- **`server/api/people/independent.get.ts`** — new GET endpoint. Joins `officialRepos` (kind === 'user') with the `skills` D1 table.
  - Returns `{ devs: IndependentDev[], total: number }`
  - `IndependentDev`: `{ owner, repo, displayName, avatar, github, skillCount, lastSyncedAt }`
  - `displayName` resolves from cached GitHub profile (`useStorage('cache')`, key `github:profile:{owner}`) populated by `/api/orgs/[owner]`. Falls back to `owner`.
  - `repo` = first official repo for that owner (kind === 'user').
  - SQL aggregate: `SELECT COUNT(*) AS skillCount, MAX(last_synced_at) AS lastSyncedAt FROM skills WHERE owner = ? AND (broken_since IS NULL OR broken_since > unixepoch() - 604800)`
  - Filters out owners with `skillCount === 0` server-side.
  - Sorted by `skillCount DESC` (then `owner ASC` for stability).
  - Cached via `defineCachedEventHandler({ maxAge: 60 * 5, swr: true })` matching `/api/orgs/[owner]`.

### UI
- **`app/pages/people/index.vue`** — modified
  - Adds chip filter row (`UButtonGroup` with three `UButton`s for All / Independent / Community).
  - Filter state synced to URL via `?filter=independent` query param. `useRoute()` + `navigateTo({ query: ... })` on click. Invalid values coerced to `all`.
  - Hero `<h1>` unchanged ("Curators"). Hero subtitle replaced with the confirmed copy.
  - SEO: `useSeoMeta` description rewritten: `Developers who curate agent skill collections, plus independent developers shipping their own skill repos.`
  - Renders Independent section above Community section when filter is `all` or `independent`.
  - Renders Community section when filter is `all` or `community`.
  - Section headers use `<h2 class="section-label mb-4">` (matches existing `[owner].vue` pattern at line 400).
  - Each section has its own `pending`/`error`/`empty` block (skeleton matches existing curator skeleton).

- **`app/components/PeopleIndependentCard.vue`** — new
  - Receives a single `IndependentDev` prop.
  - Visual: `rounded-lg border border-default p-4` matching existing curator card.
  - Avatar: `<img src="https://github.com/{owner}.png">` 40px, `loading="lazy"`. On error, swaps to `<UIcon name="i-lucide-user">` fallback inside `bg-muted` circle (matches people/index.vue:138 pattern).
  - Display name + `@handle` where handle has a small `i-lucide-github` icon prefix (size-3) to signal provenance.
  - Bottom row: `{n} skills` (left) · `{relative time}` (right) using `useTimeAgo(lastSyncedAt * 1000)`.
  - Wraps the whole card in `<NuxtLink :to="/orgs/{owner}">`.

## Testable behaviors

### Interaction
- **[C1]** GIVEN /people is open with default filter, WHEN the page renders, THEN the URL has no `filter` query param and both Independent + Community sections are visible with Independent appearing above Community in DOM order.
- **[C2]** GIVEN /people is open, WHEN the user clicks the "Independent" chip, THEN the URL updates to `/people?filter=independent`, the Community section unmounts from the DOM, and Independent remains visible.
- **[C3]** GIVEN /people?filter=independent, WHEN the user clicks "All", THEN URL becomes `/people` and both sections are visible.
- **[C4]** GIVEN /people, WHEN the user clicks an Independent card, THEN they navigate to `/orgs/{owner}` (verified by destination URL).
- **[C5]** GIVEN /people, WHEN the user clicks a Community card, THEN they navigate to `/people/{handle}` (existing behavior preserved).

### State
- **[C6]** GIVEN /api/people/independent has not yet responded, WHEN the Independent section is visible, THEN a 6-card skeleton grid renders inside the Independent section only (Community section is unaffected).
- **[C7]** GIVEN /api/people/independent returns an empty array, WHEN the Independent section is rendered with `filter=all` or `filter=independent`, THEN an inline "No independent developers yet" empty state renders inside the Independent section. The Community section remains rendered separately.
- **[C8]** GIVEN /api/people/independent returns a 500, WHEN the Independent section is rendered, THEN an inline error state with a Retry button renders inside the Independent section. Clicking Retry triggers `refresh()` on that fetch only.

### Responsive
- **[C9]** GIVEN viewport width 375px, WHEN /people renders, THEN both card grids are single-column (`grid-cols-1`) and the chip filter row wraps without horizontal scroll.
- **[C10]** GIVEN viewport width 768px, WHEN /people renders, THEN both card grids are two-column (`sm:grid-cols-2`) and the chips remain on a single line.

### Dark mode
- **[C11]** GIVEN dark mode is active, WHEN /people renders, THEN no element uses `bg-white`, `text-black`, or hardcoded gray scales; all surfaces resolve via existing `--ui-*` tokens, and the active chip remains legible against `bg-default`.

### Accessibility
- **[C12]** GIVEN /people is open, WHEN the user tabs, THEN the focus order is: nav → chip filter (3 buttons) → Independent cards → Community cards. Active chip exposes `aria-pressed="true"`.

### SSR
- **[C13]** GIVEN a non-bot first-load of /people, WHEN HTML is fetched (curl with no JS), THEN the response contains hero copy and the chip filter labels in the markup. Card content may stream in client-side (lazy fetch is the existing pattern).
- **[C14]** GIVEN a bot user-agent (`useBotDetection().isBot === true`) loads /people, WHEN HTML is fetched, THEN both API responses are awaited server-side and the rendered HTML contains at least one Independent card (assuming non-empty data) and at least one Community card.

## Design expectations

- **Theme tokens**: existing project tokens. Card visual reuses the exact treatment from the existing curator card (`rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]`). No new CSS, no new theme tokens.
- **Section headers**: `section-label` utility class (already used at people/[handle]/index.vue and orgs/[owner].vue).
- **Visual weight**: Independent and Community sections must look equal in importance; chip filter is the only differentiator + GitHub icon glyph next to the handle on Independent cards.
- **Design principle (from brand guidelines)**: editorial framing over promotional. Chips and copy avoid maintainer/author/creator/made-installable language.
- **Layout structure**: hero (max-w-5xl) → USeparator → chip row (max-w-5xl, py-6) → Independent section (max-w-5xl) → Community section (max-w-5xl). Each content section uses `py-8 md:py-12`.

## Out of scope

- DB migrations (no new tables/columns)
- Changes to `/api/social/curators.get.ts` shape
- Changes to `/orgs/[owner]` page
- Nav changes (label stays "Curators")
- New routes for GitHub-only devs (`/devs/*`, `/people/{owner}` for non-atproto)
- Sitemap updates (`/orgs/[owner]` already covers them)
- Inline install snippets on Independent cards (per question 4)
- Refactor of the existing curator card into a separate component
- Changes to `/skills` page (per plan)

## Files

New:
- `server/api/people/independent.get.ts`
- `app/components/PeopleIndependentCard.vue`

Modified:
- `app/pages/people/index.vue`
