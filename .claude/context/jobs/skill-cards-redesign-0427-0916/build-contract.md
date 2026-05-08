# Skill cards redesign — `/orgs/[owner]` page

Job: `skill-cards-redesign-0427-0916`
Phase: 3 (Polish — refining existing skill grid in `app/pages/orgs/[owner].vue:459-498`)

## Why now

Today the skill card under each repo header reads almost entirely as install command + name. Descriptions exist in the registry data and are rich (sample: 250+ char editorial blurbs from `github/awesome-copilot`), but they're clamped to 2 lines beneath a prominent code block. The user wants the description to lead and useful metadata to surface, not the install command to dominate.

## What changes

**Files touched:**
- `app/pages/orgs/[owner].vue` — replace the per-skill `<NuxtLink>` markup at lines 460-498

**No API or schema changes.** All data is already present on `RegistrySkill` (`description`, `installs`).

## Card before / after

Before (current):
```
┌─────────────────────────────────┐
│ git-commit  [npm]               │
│ Execute git commit with conv… (2 lines)
│ ┌─────────────────────────────┐ │
│ │ npx -y skilld add gh:gith…  │ │ ← code block, dominant
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

After (target):
```
┌─────────────────────────────────┐
│ git-commit              ↓ 12.6k │ ← name left, install count right
│                                 │
│ Execute git commit with conv-   │
│ entional commit message analy-  │ ← description gets 3 lines
│ sis, intelligent staging, and…  │
└─────────────────────────────────┘
[hover: top-right copy button overlays the install count]
```

## Testable behaviors

- [C1] GIVEN `/orgs/github`, WHEN page renders, THEN every skill card shows the skill name, the description (clamped to 3 lines), and an install-count chip (e.g. `↓ 12.6k`). No raw install command is visible inside the card.
- [C2] GIVEN any skill card, WHEN the user hovers it, THEN a copy button appears top-right and clicking it copies `gitInstallCmd(owner, repo, name)` to the clipboard and flips its icon to a check for ~2s (existing `copySkillCmd` behavior, preserved).
- [C3] GIVEN a skill where `description` is null, WHEN the card renders, THEN the description region is omitted (no fake placeholder text) but the card retains a min-height matching cards with descriptions so the grid stays even.
- [C4] GIVEN a skill where `installs === 0`, WHEN the card renders, THEN the install-count chip is hidden (no `↓ 0`).
- [C5] GIVEN the user clicks the card body, WHEN navigation occurs, THEN they land on `/skills/{owner}/{repo or name}` (existing behavior preserved).
- [C6] GIVEN the user tabs through the page, WHEN focus reaches a card, THEN the copy button becomes visible via `focus-visible:opacity-100` (existing pattern preserved) and the card outline is the Nuxt UI default focus ring.
- [C7] GIVEN the page loads, WHEN viewing at 375px, THEN cards stack to 1 column and the install-count chip stays right-aligned without wrapping under the name.
- [C8] GIVEN the page loads, WHEN viewing at 768px, THEN cards lay out at 2 columns (`sm:grid-cols-2`) with consistent height per row.
- [C9] GIVEN dark mode is active, WHEN viewing skill cards, THEN border, text, and muted text all use `--ui-*` tokens (no hardcoded colors); hover border swaps to `var(--ui-text-muted)` (existing pattern preserved).
- [C10] GIVEN any card, WHEN inspected with grep, THEN no `slate-`, `gray-`, `zinc-`, `bg-white`, `text-black`, or hex literal appears in the new markup.
- [C11] GIVEN a card with a long description, WHEN rendered, THEN the description truncates with ellipsis at 3 lines and `leading-relaxed`; full description remains accessible by clicking through to the skill detail page.
- [C12] GIVEN SSR, WHEN curling `/orgs/github`, THEN the response HTML contains the description text of at least the first skill before hydration (e.g. "Execute git commit").

## Design expectations

- **Theme tokens used**: `border-default`, `text-muted`, `bg-muted` (for hover), `--ui-text-muted` for hover border, `data-label` utility class for the install count.
- **Typography**: name in `font-mono text-sm font-medium`, description in `text-xs text-muted leading-relaxed`, install count in `data-label` (mono, xs, tabular-nums).
- **Visual weight**: description is the dominant content. Install count is a single quiet chip. No code block competes with the prose.
- **Spacing**: card stays at `p-4 pr-12` (room for hover copy button). Internal stack: name row → `mt-2` → description.
- **Density**: matches design principle "Progressive Data Discovery": one signal (install count) on the card; full metadata lives on the skill detail page.
- **Quiet principle**: no new tokens, no shadows, no badges per card (the repo header already establishes source). The "npm" badge is removed because (a) for `github/awesome-copilot` the install path is `gh:` not `npm:`, and (b) showing the same badge on every card under a repo header is redundant noise.

## Out of scope

- Changes to skill cards on `/skills`, `/skills/official`, homepage, or other pages. (Those pages share the install-cmd-in-card pattern; tackling them is a separate job to keep this review tight.)
- Schema or registry changes. Description data already exists.
- Adding tags / "guide" vs "package" badge differentiation. The `npm` badge accuracy is a real issue but a separate decision.
- The repo-header card at lines 411-457 (which still shows the repo-level install command — that's the right place for it).
