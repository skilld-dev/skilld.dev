# Build Contract — orgs-page-0425-1834

## Job

Dedicated profile page for skill **owners**. An owner is a GitHub handle that publishes one or more skills; it can be either:

- An **organization** (kind: `org`) — e.g. `anthropics`, `vercel`, `cloudflare`
- A **person** (kind: `user`) — e.g. `obra`, `antfu`, `mattpocock`

Currently `/skills?owner=obra` is a flat filtered list. The new page replaces that filtered surface with an editorial profile: identity, fingerprint, install command, skills.

## Routes

- **New**: `/orgs/[owner]` — single owner profile page
- **Updated**: `/skills` — "View all" links and featured-section avatars now navigate to `/orgs/[owner]` instead of `?owner=` query

## Files

- `app/pages/orgs/[owner].vue` (new)
- `server/api/orgs/[owner].get.ts` (new)
- `app/pages/skills/index.vue` (updated: link targets)

## Voice & Identity Treatment

Within the **quiet + editorial + warm** brand: avoid loud differentiation between kinds. Differentiate through **shape and copy**, not color or decoration.

| Element | Org (`anthropics`) | Person (`obra`) |
|---|---|---|
| Avatar | `rounded-lg` (institutional logo) | `rounded-full` (personal photo) |
| Kind badge | `[org]` mono uppercase | `[person]` mono uppercase |
| Headline copy | "Skills published by Anthropic" | "Curated skills from @obra" |
| Layout | identical | identical |

Same components, same scale, same density. The shape and the badge tell the story.

## Page Anatomy

1. **Identity hero** (`max-w-5xl`)
   - 96px avatar (left)
   - Display name (sans, text-xl) + `@handle` (mono, muted)
   - Kind badge + GitHub bio (one paragraph, max-w-lg, muted)
   - Stat line: `N skills · M repos · K stars`
   - Stack fingerprint: `Mostly: typescript, vue, nuxt` (top 3 tags)
   - Action row: GitHub button + Website button (if blog available)

2. **Install command** (single-repo owners only)
   - One-line install command in mono code block with copy button
   - Helper text: "Install all of {name}'s skills"

3. **Skills section**
   - Heading: `Skills` (section-label)
   - **Multi-repo owners**: subheaders per `owner/repo`, each with skill list below
   - **Single-repo owners**: flat grid (1/2/3 columns by breakpoint)
   - Each skill card: name + npm badge + stars + description, plus copy-install hover button (mirrors `/skills` page treatment)

4. **Footer line**: `Synced {timeago}` (muted, mono, small)

## Acceptance Criteria

### Interaction (≥5)

- **C1** GIVEN any owner with skills, WHEN visiting `/orgs/{owner}`, THEN the page renders display name, handle, avatar, and skills.
- **C2** GIVEN the profile page is loaded, WHEN clicking the GitHub button, THEN `github.com/{owner}` opens in a new tab.
- **C3** GIVEN single-repo owner, WHEN clicking the install command copy button, THEN the command is on clipboard and the icon flips to check for ~2s.
- **C4** GIVEN any skill card on the page, WHEN clicking it, THEN it navigates to `/skills/{owner}/{repo}/{name}` (or `/skills/{owner}/{name}` when repo is `skills`).
- **C5** GIVEN multi-repo owner, WHEN clicking a repo subheader link, THEN `github.com/{owner}/{repo}` opens in a new tab.
- **C6** GIVEN owner has a `blog` URL on GitHub, WHEN clicking the website button, THEN that URL opens in a new tab.

### State (≥3)

- **C7** GIVEN the page is fetching, WHEN before data resolves, THEN avatar/heading/skill list show skeleton placeholders.
- **C8** GIVEN owner has zero skills or does not exist, WHEN page renders, THEN an empty state shows `Couldn't find that owner.` with a "Back to skills" link.
- **C9** GIVEN the API returns an error, WHEN the page renders, THEN an alert region shows `Couldn't load this profile. Check your connection and try again.` with a retry button.

### Responsive (≥2)

- **C10** AT 375px viewport, WHEN page renders, THEN avatar and identity text stack vertically (avatar above name) with no horizontal scroll.
- **C11** AT 768px viewport, WHEN page renders, THEN avatar sits left of the identity text and skills render in a 2-column grid.

### Dark mode (≥1)

- **C12** GIVEN dark mode active, WHEN page renders, THEN background, text, borders, and avatar ring use semantic tokens (no hardcoded hex visible) and contrast remains AA.

### Accessibility (≥1)

- **C13** GIVEN the page is loaded, WHEN inspecting structure, THEN there is exactly one `<h1>` with `id="org-heading"`, all interactive elements have aria-labels or visible text, and tab order flows hero → install → skills.

### SSR (≥1)

- **C14** GIVEN the route is server-rendered, WHEN viewing `view-source:`, THEN the rendered HTML contains the owner's display name, `@handle`, and at least one skill name before any client hydration.

### Differentiation (kind-specific)

- **C15** GIVEN owner kind is `org`, WHEN page renders, THEN avatar is `rounded-lg` and kind badge text is `org`.
- **C16** GIVEN owner kind is `user`, WHEN page renders, THEN avatar is `rounded-full` and kind badge text is `person`.

### SEO (essential — verified with `check_meta_tags`, `validate_schema`)

- **C17** Title tag is unique per owner. Format: `{display name} (@{handle}) — Skills on skilld` (≤60 chars where possible). Truncates display name, never `@handle`.
- **C18** Meta description includes the kind, skill count, and at least one fingerprint topic. Format: `{N} agent skills published by {name} on skilld. {Topic1}, {Topic2}, {Topic3}.`
- **C19** Canonical link points to `https://skilld.dev/orgs/{owner}` (no trailing slash, owner lowercased).
- **C20** OG image is generated via `defineOgImage` using the existing `Page.takumi` or a kind-aware variant. Title shows display name; description shows skill count.
- **C21** JSON-LD structured data is rendered server-side: `Person` schema for `kind=user`, `Organization` schema for `kind=org`. Includes `name`, `url` (canonical), `image` (avatar), `sameAs: [github profile, blog]`, `description`.
- **C22** All skill links on the page use real `<a href="/skills/...">` anchors (not click handlers) so they are crawlable and open in the same tab.
- **C23** `/orgs/[owner]` is included in the sitemap. The sitemap source enumerates every owner that has at least one skill.
- **C24** Heading hierarchy is exactly one `<h1>` for the owner's name, `<h2>` for "Skills" / "Install", `<h3>` per repo (when grouped). No skipped levels.
- **C25** Avatar `<img>` has descriptive `alt` text: `Avatar for {display name}` (not just "avatar").

## Design Expectations

- **Tokens used**: `bg-default`, `bg-muted`, `bg-elevated`, `text-default`, `text-muted`, `text-highlighted`, `border-default`, `--ui-color-primary-500` for active/focus only.
- **Spacing**: page sections at `py-8 md:py-12`, hero at `pt-12 pb-6 md:pt-16 md:pb-8`. Cards `p-4`. Section gaps `mb-6`.
- **Typography**: H1 at `font-mono text-2xl sm:text-3xl font-medium tracking-tight` (matches `/people` and `/skills`). Helper text `text-sm text-muted leading-relaxed`. Stack fingerprint `font-mono text-xs text-muted`.
- **Avatars**: `size-24` (96px) on desktop, `size-20` on mobile. `rounded-full` for `user`, `rounded-lg` for `org`. `border border-default` for visibility.
- **Motion**: none beyond Nuxt UI defaults; this matches the quiet brand. Hover transitions on borders only (200ms).
- **Stack fingerprint**: data-label style, inline. Format: `Mostly: tag1, tag2, tag3` (top 3 tags by occurrence). Skipped if no tags exist.
- **Quiet principle**: 90% neutrals; rose accent only on kind badge tinting (subtle variant) and active focus rings. Borders, not shadows, define every surface.

## SEO Strategy

The page must rank for "{owner} agent skills" and "{owner} claude skills" queries. To support that:

- Server-render all primary content (handle, name, description, skill names, install command). The fetch must NOT be `lazy` for bots — reuse the `useBotDetection` pattern from `/people/[handle]`.
- Include the owner's GitHub bio in the rendered HTML when available. Bot crawlers see the same content as users.
- Internal linking: every skill on the page is a real `<NuxtLink>` to `/skills/{slug}`. Every `/skills/` page already links back to the owner via the `{owner}/{repo}` text — verify those links use the new `/orgs/{owner}` route as a follow-up (out of scope for this build, leave a note).
- Sitemap: add `/orgs/[owner]` entries by listing distinct owners from the registry. Excluded sitemap path `/orgs/**` similar to `/skills/**` and source it from a new `__sitemap__/orgs` endpoint.
- Validate after build:
  - `mcp__nuxt-seo__check_meta_tags` on `/orgs/anthropics` and `/orgs/obra` — confirm title, description, canonical, OG.
  - `mcp__nuxt-seo__validate_schema` on the same routes — confirm Person/Organization JSON-LD is valid.

## Out of Scope

- `/orgs/` index (top owners directory) — separate page
- Following/subscribing to an owner (not a feature)
- Cross-link to atproto curator profile if the GitHub handle matches a curator (stretch)
- Editing org metadata (no admin UI for this dataset)
- Redirect from `/skills?owner=X` → `/orgs/X` (the filter still works; only featured "View all" links change)

## Design Principle Expression

The page expresses **Progressive Data Discovery**: top of page shows three signals (count, fingerprint, install) before any individual skill. The full list lives below the fold and reveals more as the user scrolls. No metric is shown without a label, no decoration replaces real content.

It expresses **Human Warmth** through the avatar, the editorial subhead from GitHub bio, and the rose accent on the kind badge — used once, near the identity, then never repeated on the page.

It expresses **Quiet** by giving an org `anthropics` and a person `obra` the exact same layout. The shape of the avatar, plus four characters of mono text in the kind badge, is the entire visual story.
