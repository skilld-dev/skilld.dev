# Build Contract: /nuxt framework page

Bespoke discovery page for the Nuxt skill ecosystem on skilld.dev. Lists skills tagged `nuxt` and the GitHub orgs/users who publish them.

## What will be built

### Server
- `server/api/tags/[slug].get.ts` — generic tag profile endpoint (used by /nuxt now, reusable for future tag pages). Returns:
  - `tag: {slug, label, description}` from TAXONOMY
  - `totalSkills: number`
  - `topOwners: Array<{owner, kind, displayName, avatar, count, totalStars}>` (top 8 by skill count)
  - `skills: RegistrySkill[]` (all skills tagged with this slug, sorted by installs desc)
  - `relatedTags: Array<{slug, label, count}>` (top 5 tags that co-occur with this one)
  - `fetchedAt: ISO string`
  - Cached 5min with SWR; key `tag:v1:{slug}`.
  - Returns 404 if slug not in TAXONOMY or no skills carry it.

### Page
- `app/pages/nuxt.vue` — bespoke landing for the Nuxt tag. Sections:
  1. **Hero** — Nuxt brand mark (`i-simple-icons-nuxtdotjs`), `h1` "Skills for Nuxt", short editorial intro, stat row (`X skills`, `Y contributors`, `Z stars combined`).
  2. **Top contributors** — horizontal row (or 2-3 col grid on desktop) of owner cards. Each shows avatar, displayName, `@handle`, skill count. Links to `/orgs/{owner}`.
  3. **Skills index** — grid of skill cards grouped by owner (mirrors `/orgs/[owner].vue`'s repo grouping pattern but inverted: owner heading then their Nuxt skills). Each card: name, description, install command with copy button.
  4. **Related tags** — small footer row of co-occurring tag chips (vue, typescript, frontend, etc.) linking nowhere yet (chips, not links — the user opted out of generic tag pages).

## Testable behaviors

### Interaction
- [C1] GIVEN page loaded, WHEN I click "Copy" on a skill card's install command, THEN clipboard contains `npx skilld add github:{owner}/{repo}/{name}` and the icon swaps to a check for ~2s
- [C2] GIVEN page loaded, WHEN I click an owner card in "Top contributors", THEN I navigate to `/orgs/{owner}`
- [C3] GIVEN page loaded, WHEN I click a skill card title, THEN I navigate to `/skills/{owner}/{repo}/{name}` (or appropriate slug per `skillSlug` helper)
- [C4] GIVEN page loaded, WHEN I click the GitHub icon link in the hero, THEN it opens https://nuxt.com in a new tab (rel=noopener)
- [C5] GIVEN page loaded with the keyboard, WHEN I tab through interactive elements, THEN focus rings appear in the configured Nuxt UI ring style and reach every owner card, every skill card, every copy button

### State
- [C6] GIVEN the API has not yet resolved, WHEN the page is rendering, THEN I see skeleton placeholders for the hero stat row and at least 6 skill card rows (no jank)
- [C7] GIVEN the API returns 404, WHEN the page renders, THEN I see an empty state with copy "No Nuxt skills indexed yet." and a "Browse all skills" button to `/skills`
- [C8] GIVEN the API throws, WHEN the page renders, THEN I see an error state with copy matching the brand voice (direct, no apology theatre) and a "Retry" button that calls `refresh()`

### Responsive
- [C9] GIVEN viewport at 375px width, WHEN page rendered, THEN top contributors render as a single column or horizontal scroll row, skill grid is single column, no horizontal page scroll
- [C10] GIVEN viewport at 768px width, WHEN page rendered, THEN top contributors render in a 2-3 column grid, skill grid in 2 columns, hero remains centered with comfortable margins

### Dark mode
- [C11] GIVEN the user has dark mode active, WHEN the page renders, THEN backgrounds use `bg-default` / surface tokens (not `bg-white`), text uses `text-default` / `text-muted`, and the Nuxt mark icon inherits `text-current` rather than the brand green (per design guidelines: warm-only palette)

### Accessibility
- [C12] GIVEN a screen reader, WHEN the page is read, THEN the hero has an `<h1>` with the page intent, top contributors section is labelled (`aria-labelledby` -> `<h2>`), and the skills section is labelled. Owner avatars have alt text. The copy buttons have aria-labels that change to "Copied" on success.

### SSR
- [C13] GIVEN `curl http://localhost:3000/nuxt`, WHEN the response is inspected, THEN the HTML body contains the literal string "Skills for Nuxt" before any hydration script (verifies SSR rendered the heading, not just an empty Vue mount point)

## Design expectations

Tokens used (project's quiet editorial system):
- Surfaces: `bg-default`, borders via `border-default`, no shadows on cards (border-only hover state)
- Type: hero `h1` in `font-mono` per project convention (mono for chrome/headings); body in `font-sans` (Plus Jakarta)
- Color: rose accent strictly reserved (likely just on the "Top contributors" badge or skill count emphasis); 90% warm stone neutrals
- Spacing: `max-w-5xl px-4 sm:px-6`, sections `py-8 md:py-12`, card padding `p-4`, gap-3 in lists
- Radius: `rounded-lg` everywhere
- Icons: lucide for UI chrome, `simple-icons:nuxtdotjs` for the Nuxt mark only (1 use, in hero)
- Custom utilities: `.section-label`, `.data-label` for stat rows
- Motion: existing transitions only (200ms hover on borders); no entrance animations on first cut

Layout principle (Progressive Data Discovery):
- Hero shows top-line metrics ("X skills · Y contributors")
- Owner cards show count only, not full skill lists
- Skill cards show 1-line summary; full detail lives behind the click

Brand voice (from brand-guidelines.md):
- Hero copy: editorial declarative, e.g. "Skills for Nuxt." subtitle: "Curated agent skills for Nuxt apps, modules, and Nitro routes, from developers shipping in production."
- No "AI-powered", no "supercharge", no exclamation marks
- Empty state: "No Nuxt skills indexed yet. Browse the full registry."

## Out of scope

- Generic `/skills/tag/[slug]` page (user picked hand-rolled /nuxt only)
- Curators/collections section (user picked owners-as-authors)
- Filtering/sorting controls on the page (skills sorted by installs desc, no client controls)
- Tag chips at footer being clickable (they are display-only — generic tag pages don't exist yet)
- Adding `nuxt` keyword to existing skills (taxonomy/tagging is a separate pipeline already in place)
- Updating `/skills/index.vue` to link to `/nuxt` (can be added later)
- Nuxt-green branding colors (would violate the no-cold-color rule in design-guidelines.md)
- Nav link to /nuxt (header nav unchanged in this build)