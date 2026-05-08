# Build Contract — Curator Notes Phase 1

_Job: `positioning-vs-skills-sh-0426-2000`_
_Plan: `curator-notes-plan.md`_
_Scope: Phase 1 (promote what exists, no schema change)_

## What will be built

Phase 1 has 5 surfaces in the plan. Three are buildable today; two depend on sibling plans not yet implemented.

**Buildable in this job:**
- **#1 Skill page pull-quote** — `app/pages/skills/[...slug].vue`. New "Why curators picked this" section between the header section and the AI summary section, rendered when ≥1 curator has a non-empty `reason`. Larger body type, no truncation, avatar + handle + collection link as citation.
- **#5 OG / social meta** — `app/pages/skills/[...slug].vue` and `app/pages/people/[handle]/[slug].vue`. Update `useSeoMeta.description` to prefer the top curator reason on skill pages and to include the first skill's reason on collection pages. OG image components (`Skill.takumi.vue`, `Collection.takumi.vue`) get an optional `reason` prop and render a quoted line when present.
- **W1 Default-visible reason input** — `app/pages/people/[handle]/edit-skills.vue` and `app/components/CollectionEditor.client.vue`. The reason editor is auto-expanded for the first skill in a collection (or first skill added in this session), collapsed thereafter. Placeholder copy: `Why this skill? (one line is plenty)`. Adds an inline reason editor to `CollectionEditor.client.vue` (currently the editor stores `reason` in state but exposes no UI for it).

**Deferred (blocked by sibling plans):**
- **#2 Activity feed inversion** — depends on `recent-publishes` / `recent-updates` feeds in `github-integration-plan.md`, not yet built.
- **#3 Network feed inversion** — depends on the network feed in `network-feed-plan.md`, not yet built.

When those feeds ship, the inversion rule is documented in this plan and should be applied at build time. Not landing today.

## Testable behaviors

### #1 Skill page pull-quote

- `[C1]` GIVEN a skill at `/skills/<slug>` with ≥1 curator whose `reason` is non-empty, WHEN the page is rendered, THEN a `Why curators picked this` block appears between the header section (install command) and the `What it does` AI-summary section, with the curator's full reason text in body-scale typography (≥16px) and no truncation/line-clamp.
- `[C2]` GIVEN a skill where every curator's `reason` is empty (or there are no curators), WHEN the page is rendered, THEN the pull-quote block is absent and the existing layout is unchanged.
- `[C3]` GIVEN a skill with 2+ curators with reasons, WHEN the page is rendered, THEN the curators are stacked top-to-bottom in the same order they appear in `data.curators`. Each entry shows the curator avatar (32-40px), full reason text, and a citation line linking to the curator profile and the source collection.
- `[C4]` GIVEN any pull-quote entry, WHEN the user clicks the curator handle, THEN navigation goes to `/people/<handle>`. WHEN the user clicks the collection name, THEN navigation goes to `/people/<handle>/<collectionSlug>`.
- `[C5]` GIVEN the pull-quote block on mobile (375px), WHEN rendered, THEN the avatar and quote stack remains readable; tap targets on links remain ≥44px height.
- `[C6]` SSR assertion: GIVEN a curl of `/skills/<slug>` for a skill with reasons, WHEN the response is read, THEN the response HTML contains the literal reason text from the top curator before any client hydration.
- `[C7]` Dark-mode assertion: GIVEN dark mode active, WHEN the pull-quote renders, THEN border colors and text contrast use design-system tokens (`border-default`, `text-default`, `text-muted`) and never hard-coded `slate-*`/`gray-*`/`#000`/`#fff`.

### #5 OG / social meta

- `[C8]` GIVEN a skill page request and the skill has 1+ curator reasons, WHEN `useSeoMeta` evaluates, THEN the resolved `description` (and therefore `og:description`/`twitter:description`) starts with the highest-priority curator reason in quotes, attributed to the curator handle, truncated to 200 characters with ellipsis if needed.
- `[C9]` GIVEN a skill page request with no reasons, WHEN `useSeoMeta` evaluates, THEN the description falls back to the existing summary blurb / GitHub description / installs string, unchanged from current behavior.
- `[C10]` GIVEN a collection page request, WHEN `useSeoMeta` evaluates and the first skill in the collection has a non-empty `reason`, THEN the description appends a quoted excerpt of that reason after the existing preamble/description excerpt, total length capped at 200 chars.
- `[C11]` GIVEN the `Skill.takumi` OG component is rendered with a `reason` prop, WHEN the image generates, THEN a quote-styled line appears beneath the install command rendering the reason and curator handle. Without the prop, the image looks identical to the current implementation.

### W1 Default-visible reason input

- `[C12]` GIVEN a freshly opened personal-skills editor at `/people/<handle>/edit-skills` with at least one skill loaded, WHEN the user adds the first new skill in this session, THEN the inline reason input is mounted in the open/editing state for that skill (no `+ add reason` button-shaped placeholder).
- `[C13]` GIVEN the user has already added one skill in this session and is adding a second skill, WHEN the second skill is added, THEN its reason input is collapsed (showing the existing `+ add reason` affordance), matching today's behaviour.
- `[C14]` GIVEN the editor at `/collections/new` (i.e. `CollectionEditor.client.vue`), WHEN the page mounts and the user adds the first skill, THEN an inline reason input appears beneath the skill badge with the placeholder `Why this skill? (one line is plenty)`. WHEN the user adds the second skill, THEN no inline reason input appears for that skill (only the first-skill prompt is auto-expanded).
- `[C15]` GIVEN any auto-expanded reason input, WHEN the user types and blurs (or presses Enter), THEN the value is committed to the underlying `skillMeta` / `skills[].reason` state. WHEN the user leaves the input empty and blurs, THEN no `reason` is persisted (matches existing semantics).
- `[C16]` Accessibility: GIVEN the auto-expanded input, WHEN it is mounted, THEN it has an associated `<label>` (or `aria-label`) describing what it captures, and tab order flows skill → reason → next skill in the list.

### Cross-cutting

- `[C17]` GIVEN any of the changed pages, WHEN `curl -sf "http://localhost:<port>/<route>"` runs against the dev server, THEN it returns 200 with no console build errors logged.
- `[C18]` GIVEN the changed `.vue` files, WHEN grep'd for hard-coded color tokens, THEN there are no occurrences of `bg-white`, `text-black`, `slate-*`, `gray-*`, `zinc-*`, `stone-*` (except neutral if configured), or hex literals.

## Design expectations

### Pull-quote (#1)

- **Principle**: "Quiet, editorial, restrained." The pull-quote borrows the book-jacket-blurb model called out in the plan. No glow, gradient, or blur per design guidelines.
- **Structure**: `<section>` with `section-label` heading `Why curators picked this`. Each entry is a `<figure>` wrapping a `<blockquote>` and `<figcaption>`. Stacked vertically with `space-y-3`, contained in `max-w-3xl` matching surrounding sections.
- **Tokens**: `border-default` for entry borders, `rounded-lg`, `p-4 sm:p-5` (matches detail-view padding rule), `text-base leading-relaxed` for the quote body (≥16px), `data-label`/`text-xs text-muted` for the citation. Curator avatars at `size-9` (36px) keep the rhythm with existing curator panels at `size-8`. No accent stripes.
- **Citation pattern** (avoiding em dashes per project writing rules): the quote sits on its own line with the citation stacked below as `<curator handle> · <collection name>` in mono small text, both linked.
- **Position**: between the header `<section>` (install action) and the `<template v-if="data.summary">` block. Sits above all other content sections so the editorial voice is the first thing after the install command.

### OG description (#5)

- **Format**: `"<reason>" — @<handle>` pattern in the meta tag (em dash is acceptable in machine-bound `og:description` since it is parsed/displayed by external clients, not displayed in our UI). Truncated at 200 characters with `…`.
- **OG image** (`Skill.takumi.vue` / `Collection.takumi.vue`): an optional rose-accented quote line replaces the existing `curatorCount` line when a reason is present. Mono, smaller (24-28px) than the install command.

### W1 input expansion

- **Affordance**: when auto-expanded, render the inline `<input>` (already styled in `edit-skills.vue` lines 407–415) without the surrounding `+ add reason` button. Placeholder text `Why this skill? (one line is plenty)` mirrors the editorial prompt language from the plan.
- **State carrier**: a single `firstSkillSeeded` boolean flag in each component. Set to `true` after the first skill is added in the session (or after first skill is committed) so subsequent additions fall back to the existing hover-revealed `+ add reason` affordance.

## Out of scope

- **Phase 2 / 3 / 4 items** from the plan: quick-add popover, receipts panel pairing, Bluesky cross-post template, `takeaway` lexicon field, "Notable picks" feed, share-this-pick button, with-notes filter, homepage curator card quotes.
- **#2/#3 feed inversions**: deferred until activity feeds and network feed exist (sibling plans).
- **Curator follower-count sorting**: plan recommends "top-by-curator-followers" for ordering quotes on the skill page; current data does not expose follower counts on `data.curators`. Use existing array order; sorting is a follow-up once curator records carry follower counts.
- **Carousel** for the pull-quote: plan offers carousel as one option; we use stacked layout because three to five entries fit naturally without horizontal scroll on the desktop max-w-3xl column.
- **Moderation gating**: plan calls out filtering reasons via `isProfileFlagged`. The existing `data.curators` already passes through the moderation pipeline at the API layer; no new client-side gate.
- **Retroactive sanitization** of existing reason content (trim whitespace, collapse newlines) for headline surfaces: scope is render-only as-is for now; the plan's "light sanitization at read time" is a Phase 2 concern.
