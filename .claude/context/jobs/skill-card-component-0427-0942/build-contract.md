# Componentize the skill card

Job: `skill-card-component-0427-0942`
Phase: 2 (Refactor — extract shared component, then roll out the orgs-page redesign site-wide)
Depends on: `skill-cards-redesign-0427-0916` (the description-led, install-count-chip card pattern, currently scoped to `/orgs/[owner]` only)

## Why now

The same skill-card markup is duplicated across 6 call sites with subtle drift:

| File | Lines | Variant | Notes |
|---|---|---|---|
| `app/pages/orgs/[owner].vue` | 476-513 | grid (new) | Description-led + install-count chip. Reference design. |
| `app/pages/skills/index.vue` | 510-541 | grid (official sections) | Name + tags + install code. No description. |
| `app/pages/skills/index.vue` | 549-584 | list (official sections) | Name + tags + install code in horizontal row. |
| `app/pages/skills/index.vue` | 663-701 | grid (community) | Name + npm badge + stars + owner/repo + install code. |
| `app/pages/skills/index.vue` | 708-746 | list (community) | Same content, list density. |
| `app/pages/nuxt.vue` | 342-374 | grid | Name + description (line-clamp-2) + install code. |
| `app/pages/index.vue` | 444-474 | grid (homepage popular) | Owner avatar + name + npm badge + owner/repo + install code. No copy button. |

Three concrete problems:

1. The redesign from `skill-cards-redesign-0427-0916` (description-led, install-count chip, no install code in body) only landed on `/orgs/[owner]`. Every other site still leads with the install command.
2. The `npm` badge is mislabeled on every site that includes it: skills under `gh:` install paths (e.g. `github/awesome-copilot`) are tagged `npm`.
3. Copy-button behavior diverges: some sites use `copyCmd` keyed by `skill.name`, others use `copySkillCmd` keyed by `${owner}/${name}`. The `@click.stop.prevent` fix from the previous job only exists in `/orgs/[owner]`; on every other page, clicking the copy button still fires the parent `<NuxtLink>` and navigates away.

A single `<SkillCard>` component makes the redesign rollout one diff, fixes the badge mislabel everywhere at once, and unifies the copy-button behavior.

## Out of scope (deliberately)

- `NetworkFeedSection.vue` — structurally different (curator stack + reason), not the same abstraction. Leave alone.
- `app/pages/people/[handle]/[slug].vue` — collection-membership list rows, no install command, different signal set. Leave alone.
- The repo-header card at `app/pages/orgs/[owner].vue:411-457` — repo-level (not skill-level), keeps its install command. Out of scope.
- Schema or registry changes. All needed fields exist on `RegistrySkill` already.
- Replacing the `npm` badge with a `gh`/`npm`/`guide` discriminator. Tracked separately; this job just makes the badge a single line of code to fix later.

## What changes

### New component: `app/components/SkillCard.vue`

Props:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `skill` | `RegistrySkill \| { owner, repo, name, slug, description?, installs?, stars?, tags?, official? }` | required | Source data. |
| `variant` | `'grid' \| 'list' \| 'compact'` | `'grid'` | Layout density. |
| `signal` | `'installs' \| 'stars' \| 'auto' \| 'none'` | `'auto'` | Which metric chip to show top-right. `auto` picks `installs` if present, else `stars`, else nothing. |
| `showDescription` | `boolean` | `true` | Hide for `compact` use cases (homepage popular). |
| `showCopy` | `boolean` | `true` | Hide for read-only contexts (homepage popular currently has no copy button — keep that). |
| `showOwnerAvatar` | `boolean` | `false` | Render `https://github.com/{owner}.png?size=32` next to name (homepage uses this). |
| `showOwnerPath` | `boolean` | `false` | Render `{owner}/{repo}` line under name. Only when not under a repo header. |
| `showTags` | `boolean` | `false` | Render up to 3 tags inline (used by `/skills` official sections). |

Emits: none. Copy state is internal to the component.

Internal state:
- `copied: Ref<boolean>` flipped for ~2s after successful copy. Component owns its own state — parent no longer needs `copiedName`.

Markup contract:
- Default (grid) layout matches `/orgs/[owner]` exactly: `flex h-full min-h-[8.5rem] flex-col rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]`.
- Top row: name (truncate, font-mono text-sm) + signal chip (`shrink-0`, `group-hover:opacity-0` so the copy button can take its slot on hover).
- Optional owner-path row directly under the name when `showOwnerPath` is true.
- Optional tag row when `showTags` is true and `skill.tags?.length`.
- Description region: `mt-2 text-xs text-muted leading-relaxed line-clamp-3` (grid) or `line-clamp-2` (list/compact). `v-if="showDescription && skill.description"`.
- Copy button (when `showCopy`): absolute `top-3 right-3 z-10`, opacity-0 → group-hover/focus-visible, **must** use `@click.stop.prevent` to avoid triggering the parent `<NuxtLink>`.
- List variant: horizontal layout, `px-4 py-3 pr-12`, copy button vertically centered (`top-1/2 -translate-y-1/2`).
- Compact variant: no description, no copy button, no min-height. For homepage-popular density.

Tokens: only `border-default`, `text-muted`, `bg-muted`, `bg-elevated` (list hover), and `var(--ui-text-muted)`. No new custom tokens. No `slate-/gray-/zinc-/stone-/bg-white/text-black/#hex/rgb(/hsl(`.

### Adoption: rewrite the 7 call sites

| File | Replace lines | Use |
|---|---|---|
| `app/pages/orgs/[owner].vue` | 471-514 | `<SkillCard :skill />` (default grid). Adopt the component as a smoke test that nothing visible regresses. |
| `app/pages/skills/index.vue` | 509-542 (official grid) | `<SkillCard :skill variant="grid" :show-description="false" show-tags />` |
| `app/pages/skills/index.vue` | 549-584 (official list) | `<SkillCard :skill variant="list" :show-description="false" show-tags />` |
| `app/pages/skills/index.vue` | 663-701 (community grid) | `<SkillCard :skill variant="grid" :show-description="false" show-owner-path signal="auto" />` (will surface stars where installs are 0) |
| `app/pages/skills/index.vue` | 708-746 (community list) | `<SkillCard :skill variant="list" :show-description="false" show-owner-path signal="auto" />` |
| `app/pages/nuxt.vue` | 346-374 | `<SkillCard :skill />` (description leads, same as default) |
| `app/pages/index.vue` | 446-473 | `<SkillCard :skill variant="compact" :show-copy="false" show-owner-avatar show-owner-path />` |

After adoption, the `copiedName` ref + `copyCmd`/`copySkillCmd` helpers in each page can be deleted, since the component owns its own copy state.

## Testable behaviors

- [C1] GIVEN the component exists at `app/components/SkillCard.vue`, WHEN imported from any of the 4 affected pages, THEN it auto-imports via Nuxt's components dir (no explicit `import` line needed).
- [C2] GIVEN `/orgs/github`, WHEN the page renders after adoption, THEN visual diff vs the pre-adoption snapshot is zero (same markup, same classes, same hover/focus behavior). This is the regression smoke test.
- [C3] GIVEN any card with `signal="auto"` and `installs > 0`, WHEN rendered, THEN the chip shows `↓ {formatCount(installs)}` with title `"{N} weekly installs"`.
- [C4] GIVEN any card with `signal="auto"` and `installs === 0` and `stars > 0`, WHEN rendered, THEN the chip shows `★ {formatStars(stars)}` with title `"{N} GitHub stars"`.
- [C5] GIVEN any card with `signal="none"` OR no metric data, WHEN rendered, THEN no chip slot is rendered (no empty span, no whitespace).
- [C6] GIVEN any card with `showCopy="true"`, WHEN the user clicks the copy button, THEN clipboard receives `npx -y skilld add gh:{owner}/{repo}/{name}` AND the parent `<NuxtLink>` does **not** navigate. (Regression check: this is broken on every non-orgs page today.)
- [C7] GIVEN the copy succeeds, WHEN ~2s pass, THEN the button icon flips back from `i-lucide-check` to `i-lucide-copy`. Copy state is component-local; multiple cards can be in "copied" state simultaneously.
- [C8] GIVEN a card with `showDescription="true"` and `skill.description == null`, WHEN rendered, THEN no description region renders, but `min-h-[8.5rem]` keeps the grid even (existing behavior preserved from the orgs redesign).
- [C9] GIVEN `variant="list"`, WHEN rendered, THEN layout is horizontal (`flex items-center gap-4`), copy button is vertically centered, install command region is hidden below `sm:`.
- [C10] GIVEN `variant="compact"` with `showCopy="false"`, WHEN rendered, THEN no `pr-12` padding (no copy button to make room for) and no min-height. Homepage popular layout is preserved.
- [C11] GIVEN the user tabs through any page, WHEN focus reaches a card's copy button, THEN `focus-visible:opacity-100` reveals it.
- [C12] GIVEN SSR, WHEN curling each affected route (`/orgs/github`, `/skills`, `/skills/official`, `/nuxt`, `/`), THEN every response contains at least one `<a class="...border-default..."` skill card with the new markup. No hydration warnings in console.
- [C13] GIVEN dark mode, WHEN viewing any adopted page, THEN border, text, hover, and copied-feedback states all use `--ui-*` tokens. Mechanical grep over `app/components/SkillCard.vue` for `slate-|gray-|zinc-|stone-|bg-white|text-black|#hex|rgb\(|hsl\(` returns zero hits.
- [C14] GIVEN the 4 page files post-adoption, WHEN greppped for `gitInstallCmd|copyCmd|copySkillCmd|copiedName`, THEN zero hits remain in those files (helpers all moved into the component or are unused).

## Design expectations

- **Default variant = orgs page exactly.** No drift from the current `/orgs/[owner]` look. The redesign is the canonical card; everything else converges to it.
- **Density variants are layout, not aesthetic.** `grid` / `list` / `compact` differ in spacing and orientation only — typography, borders, hover, and tokens are identical.
- **Single source of truth for copy behavior.** No more split between `copyCmd` and `copySkillCmd`. The component handles its own clipboard call and 2s reset.
- **Quiet principle holds.** No badges per card by default. The `npm` label is *not* re-introduced into the new component; if the parent wants a discriminator chip later, it'll be a separate prop and a separate decision.

## Risk register

- **Behavior change risk on `/skills` and `/nuxt`**: those pages currently lead with the install command. Adoption flips the visual hierarchy to match `/orgs/[owner]`. This is intended but worth surfacing to the user before the rollout — the "rollout" framing in the previous job's known_limitations called it a follow-up, but didn't itself authorize the visual change. **Open question for review:** confirm this is the desired direction before committing.
- **Homepage popular grid is currently `compact`-style** (no description, no copy button, owner avatar, owner path). Forcing it through the same component preserves that look only if the variant prop combinations work as specified. If the homepage card looks visibly different post-adoption, the variant matrix is wrong, not the homepage.
- **Tag display on `/skills` official sections**: tags are unique to that page. Make sure the `showTags` slot doesn't accidentally show on every card (tags exist on RegistrySkill broadly).

## Acceptance

The job is done when:
1. `app/components/SkillCard.vue` exists and passes C3-C13 in isolation (a Vitest component test would be ideal, but visual + grep is acceptable for v1).
2. All 7 call sites use the component; the 4 unique page files lose their `copiedName`/`copyCmd`/`copySkillCmd` helpers.
3. `/orgs/github` is visually identical pre/post (C2).
4. `/skills`, `/skills/official`, `/nuxt`, `/` all render with the new description-led card pattern, install command no longer in the card body.
5. The parent-`<NuxtLink>` navigation bug on copy-click is fixed everywhere (C6).