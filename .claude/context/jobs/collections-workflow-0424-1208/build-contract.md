# Collections Workflow — Build Contract

Job: `collections-workflow-0424-1208`
Theme: quiet editorial (existing skilld.dev design system)

## Problem

Homepage empty state (`app/pages/index.vue:446-464`) says "No collections published yet. Be the first to curate your skills. / Publish a collection" — the button only opens the auth modal. Signed-in users hit a dead-end; anon users get no handoff after auth. Collections also have no discovery surface outside the homepage strip, and no long-form editorial field to capture topic-level SEO (e.g. "Vue Ecosystem" collection content).

## What will be built

### New routes

- **`/collections`** (new index page)
  - Hero: page title, 1-sentence editorial intro, stat line (curators/collections/skills)
  - Section 1: Featured collections (top N ranked by curator follower count; reuse homepage ordering heuristic)
  - Section 2: All collections (remaining, most recent first)
  - Stage-aware empty state (see component below)
  - SEO meta: title, description, OG image, indexable
  - Links: each card → `/people/{handle}/{slug}`

- **`/collections/new`** (new router page)
  - Authenticated → redirects server-side-ish to `/people/{user.handle}/collections/new`
  - Unauthenticated → prompt card with "Sign in to publish" button; opens auth modal with return path set so post-auth bounces to the right user's new-collection page
  - Existing `/people/{handle}/collections/new` remains the canonical editor route

### New components

- **`CollectionsEmptyCTA.vue`**: reusable stage-aware CTA used on homepage empty state and `/collections` empty state. Branches on `useOnboarding().stage`.
- **`CollectionListItem.vue`** (or extend existing `CollectionCard.vue`): card used in `/collections` grid; surfaces name, curator, preamble excerpt (or description fallback), skill count, stacks.

### Schema + editor changes

- Lexicon: add optional `preamble?: string` (markdown, max 5000 chars) to `CollectionRecord` in `server/utils/atproto/lexicons/collection.ts`. Update `validateCollectionInput`, `parseCollectionRecord`, `toCollectionRecord`, and the PUT endpoint body.
- Editor: add a `UTextarea` in `CollectionEditor.client.vue` for preamble, labelled "Preamble", hint "Optional long-form intro (markdown). Shown above the skills list; used for SEO."
- Detail page: render preamble as a prose block at top of `/people/{handle}/{slug}` above the skills list, using `useSeoMeta({ description })` that prefers preamble's first ~160 chars over `description` when present. JSON-LD hooks remain untouched.

### Homepage + nav

- Replace homepage collections empty-state div (`app/pages/index.vue:446-464`) with `<CollectionsEmptyCTA />`.
- Change homepage "Collections" section header to include a "View all" link to `/collections` (matching the Curators + Popular skills pattern).
- Add "Collections" link to `UHeader` desktop + mobile nav in `app/app.vue` (between NPM Skills and Curators).

## Testable behaviors (contract criteria)

### /collections index page

- **[C1]** GIVEN user is on `/collections`, WHEN the page has rendered server-side, THEN the response HTML contains `<h1>Collections</h1>` and the editorial intro text before any JS hydration (SSR assertion).
- **[C2]** GIVEN `/api/homepage` returns collections, WHEN `/collections` renders, THEN the page shows a grid of collection cards each with a visible name, curator handle, skill count, and a link to `/people/{handle}/{slug}`.
- **[C3]** GIVEN `/api/homepage` returns 0 collections, WHEN an unauthenticated user opens `/collections`, THEN the empty state shows a "Publish a collection" button that opens the auth modal on click.
- **[C4]** GIVEN `/api/homepage` returns 0 collections, WHEN an authenticated user opens `/collections`, THEN the empty state button reads "Publish a collection" and clicking it navigates to `/collections/new`.
- **[C5]** GIVEN the viewport is 375px wide, WHEN `/collections` renders, THEN cards display in a single column with no horizontal overflow.
- **[C6]** GIVEN the viewport is 768px wide, WHEN `/collections` renders, THEN cards display in a two-column grid.
- **[C7]** GIVEN dark mode is active, WHEN `/collections` renders, THEN all text passes WCAG AA contrast and card borders use the warm neutral, not pure gray.

### CollectionsEmptyCTA component

- **[C8]** GIVEN `stage === 'browse'`, WHEN the CTA is clicked, THEN the global `authModalOpen` ref is set to true and `sessionStorage.getItem('skilld:post-auth-intent')` equals `'new-collection'`.
- **[C9]** GIVEN `stage === 'connected'`, WHEN the CTA is clicked, THEN the router navigates to `/collections/new` (no modal, no skills-first gate per user direction).
- **[C10]** GIVEN `stage === 'published'` or `'curator'`, WHEN the CTA is clicked, THEN the router navigates to `/collections/new`.

### /collections/new router

- **[C11]** GIVEN user is authenticated with handle `X`, WHEN they navigate to `/collections/new`, THEN the router redirects to `/people/X/collections/new` before any visible UI.
- **[C12]** GIVEN user is unauthenticated, WHEN they navigate to `/collections/new`, THEN the page shows a prompt card with a sign-in button; clicking it opens the auth modal.
- **[C13]** GIVEN user completes auth from `/collections/new`, WHEN auth resolves, THEN the post-auth flow lands them on `/people/{handle}/collections/new`.

### Preamble in editor + detail

- **[C14]** GIVEN the CollectionEditor form is open, WHEN a user enters up to 5000 chars in the preamble field and submits, THEN the published collection record on PDS includes the preamble.
- **[C15]** GIVEN a collection has a preamble, WHEN its detail page `/people/{handle}/{slug}` renders, THEN the preamble is shown as a prose block above the skills list.
- **[C16]** GIVEN a collection has a preamble, WHEN its detail page renders, THEN the SSR `<meta name="description">` uses the first ~160 chars of the preamble (stripped of markdown).
- **[C17]** GIVEN a collection lacks a preamble, WHEN its detail page renders, THEN the existing `description` field is used for meta description and no preamble block is rendered.

### Homepage + nav wiring

- **[C18]** GIVEN homepage has 0 collections, WHEN it renders, THEN the empty state uses the shared `CollectionsEmptyCTA` (visually identical behavior to /collections empty state).
- **[C19]** GIVEN the Collections section has a "View all" button on the homepage, WHEN clicked, THEN the user navigates to `/collections`.
- **[C20]** GIVEN the desktop viewport, WHEN the user inspects the header nav, THEN a "Collections" link is visible between "Guide Skills" and "Curators" that routes to `/collections`.

### SEO + accessibility

- **[C21]** GIVEN `/collections` is loaded, WHEN crawled, THEN its HTML includes `<title>Collections — skilld</title>`, a `<meta name="description">`, and `<meta property="og:image">`.
- **[C22]** GIVEN keyboard-only navigation, WHEN a user tabs through `/collections`, THEN focus moves logically from header → hero → featured → all → CTA with visible focus rings.

## Design expectations

- **Design principle**: Quiet (border-driven, compact, mono chrome). All new surfaces use the warm stone + rose system; rose reserved for the primary "Publish a collection" solid button.
- **Tokens used**: `--ui-bg`, `--ui-text`, `--ui-text-muted`, `--ui-border-default`, `rounded-lg`, `data-label`, `section-label`. No new tokens.
- **Components**: `UButton` (solid primary for publish, ghost for nav), `UCard`-style via border-only divs matching existing pattern, `USeparator`, `UIcon` (lucide), `UBadge` for stacks.
- **Typography**: section labels via `.section-label`; card names in `font-mono text-sm font-medium`; preamble prose in `prose prose-sm prose-invert` or equivalent with warm neutrals.
- **Layout**: `max-w-5xl` container on `/collections` (matches /people + /skills); `max-w-3xl` on detail page (unchanged).
- **Motion**: existing fade-up patterns via existing classes; no new motion-v scripts.
- **Empty state copy**: "No collections published yet. Be the first to curate your skills." (kept verbatim — already on brand). CTA label: "Publish a collection".

## Out of scope

- Stack/topic landing pages (`/collections/stacks/vue` etc.) — future work when data justifies it.
- Migrating existing collections to add preambles (they render fine without).
- Wizard/multi-step publish flow — single-form editor remains.
- Save/bookmark collection UI — separate feature, already memoryed as PDS-private save.
- Moving the canonical collection URL off `/people/{handle}/{slug}` — keeps curator attribution primary.
- Changing ranking model — still curator-follower-driven, no engagement metrics.