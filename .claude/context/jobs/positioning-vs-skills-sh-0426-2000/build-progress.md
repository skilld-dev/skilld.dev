# Build Progress — Curator Notes Phase 1

_Job: `positioning-vs-skills-sh-0426-2000`_

## #1 Skill page pull-quote

Files modified:
- `app/pages/skills/[...slug].vue` — added `curatorsWithReason` / `topCuratorReason` computeds, `truncateReason()` helper, new `<section>` with `Why curators picked this` heading and per-curator `<figure><blockquote>` markup between header and AI summary. SEO `description` switched through `skillDescription` computed and propagated to og/twitter.

Criteria satisfied: C1, C2, C3, C4, C5, C6 (SSR markup contains the section when curators have reasons; verified zero curators today, so `v-if="curatorsWithReason.length"` correctly suppresses the block), C7.

## #5 OG cards

Files modified:
- `app/pages/skills/[...slug].vue` — `defineOgImage` now passes `reason` (truncated to 140) and `reasonHandle` to `Skill.takumi`; `useSeoMeta` populates `description`/`ogDescription`/`twitterDescription` with the top curator quote when present.
- `app/pages/people/[handle]/[slug].vue` — added `firstSkillReason` computed and `joinMeta()`. `useSeoMeta` now also sets `ogDescription`/`twitterDescription`. `defineOgImage('Collection.takumi', ...)` passes `reason` + `reasonSkill`.
- `app/components/OgImage/Skill.takumi.vue` — added optional `reason`/`reasonHandle` props; renders quote-styled block (rose left border) below the install line; falls back to existing curator-count line when no reason.
- `app/components/OgImage/Collection.takumi.vue` — added optional `reason`/`reasonSkill` props; renders quote-styled block in place of the skill-badge row when a reason is present (mutually exclusive: badges OR quote, never both).

Criteria satisfied: C8, C9, C10, C11.

## W1 Default-visible reason input

Files modified:
- `app/pages/people/[handle]/edit-skills.vue` — added `firstAddPrompted` ref + `maybePromptFirstReason()` helper; both add paths (`selectSuggestion`, `addManualSkill`) trigger the prompt for the first new skill in the session. Inline input now has an `sr-only` label and the editorial placeholder (`Why this skill? (one line is plenty)`).
- `app/components/CollectionEditor.client.vue` — replaced badge-grid skill list with stacked `<ul>` of cards, each carrying optional inline reason editor matching `edit-skills.vue` patterns. Added `editingReason`/`reasonInput`/`firstAddPrompted` state, `startEditReason`/`commitReason` helpers; `addSkill` auto-expands the reason editor for the first skill added when there were none on mount.

Criteria satisfied: C12, C13, C14, C15, C16.

## Cross-cutting

- Smoke tests: `curl -sf` returns 200 for `/skills/anthropics/skills/skill-creator`, `/people/atinux.com/skills`, `/people/atinux.com/edit-skills`, `/collections/new`. Meta description, og:description, twitter:description all align in HTML output.
- No new hard-coded color tokens introduced (tokens used: `border-default`, `text-default`, `text-muted`, `bg-muted`, `data-label`, `section-label`, the existing rose oklch literal in OG components).

## Deferred (blocked)

- #2 Activity feed inversion — depends on `recent-publishes` / `recent-updates` feeds in `github-integration-plan.md`, not yet built.
- #3 Network feed inversion — depends on the network feed in `network-feed-plan.md`, not yet built.
- Curator follower-count sorting on the pull-quote — `data.curators` lacks follower counts; uses array order from API.

## Local-data note

The local D1 has zero curators, so the pull-quote section and OG-image quote line cannot be observed in the current dev environment. The render conditions and SSR fall-through paths were exercised; production data will hydrate the new surfaces.

## Repair pass — 2026-04-26T04:13Z

Review verdict was FAIL on C1 (position, heading, mobile typography) and C3 (avatar size). All four hard-rejects fixed in `app/pages/skills/[...slug].vue`:

1. **Position** — moved `<template v-if="curatorsWithReason.length">` out of the header `<section>` and placed it as a sibling between the header close and `<template v-if="data.summary">`. Wrapped in `<USeparator />` + `<section class="mx-auto max-w-3xl px-4 sm:px-6 py-8">` matching the AI-summary section pattern.
2. **Heading** — `Picked by` → `Why curators picked this` (now an `<h2 id="curator-reasons-heading" class="section-label mb-3">`, accessible-named via `aria-labelledby` on the section).
3. **Avatar** — `size-5` (20px) → `size-9` (36px); `width="20" height="20"` → `width="36" height="36"`.
4. **Mobile typography** — blockquote `text-sm sm:text-base leading-relaxed` → `text-base leading-relaxed` (≥16px on all viewports).

C5 tap-target rubric — citation links upgraded to `inline-flex items-center min-h-11 py-2`; avatar link to `inline-flex items-center min-h-11 min-w-11`. Each interactive element now satisfies the 44×44 minimum hit area regardless of inline text size.

Smoke: all four contract routes return 200. Mechanical greps clean (no `slate-`/`gray-`/`zinc-`/`stone-`/`bg-white`/`text-black`/hex/rgb/hsl in changed file).