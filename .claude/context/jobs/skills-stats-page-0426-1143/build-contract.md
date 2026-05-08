# Skills Stats Page — Build Contract

## What this is

A single page at `/skills/stats` that surfaces aggregate trust signals across the registry. Six charts, each answering a different question about "is this skill worth my trust". Quiet aesthetic: borders, mono numerics, no shadows, no color beyond the rose accent on hover/active.

## Routes

- **`/skills/stats`** — the page itself
- **`GET /api/skills/stats`** — server endpoint returning all aggregates in one payload

## Definitions

- **Dedicated skill repo**: a repo where `repo LIKE '%skill%'` (case-insensitive). These are repos built specifically to publish skills, vs repos that happen to ship a SKILL.md alongside other things. **Only Chart 1 applies this filter.** Charts 2-6 use the full active registry so they reflect the whole ecosystem (including big multi-purpose repos like `anthropics/skills`). Each chart card shows its scope as muted helper text under the title.
- **Active skill**: `broken_since IS NULL OR broken_since > unixepoch() - 7*86400` (matches existing `NOT_BROKEN_SQL` grace period in `server/utils/skills-registry.ts:10`).
- All charts operate on the active set unless stated.

## The six charts

### Chart 1 — Star distribution (log-binned histogram)

The one the user explicitly asked for.

- **Filter**: dedicated skill repos only (`repo LIKE '%skill%'`)
- **Bins**: log10 buckets of stars: `0`, `1-9`, `10-99`, `100-999`, `1k-9.9k`, `10k+` (6 bars)
- **Visual**: vertical bars, height proportional to count, x-axis log-bin labels, y-axis count labels (mono, xs)
- **Trust read**: shows the long-tail shape, helps users calibrate "what's a typical star count for a skill repo".

### Chart 2 — Maintenance freshness

How recently are these repos pushed to. Stale repos = lower trust.

- **Source**: all active skills, grouped by repo (one row per repo)
- **Buckets**: days since `pushed_at`: `< 7d`, `7-30d`, `30-90d`, `90-180d`, `180d-1y`, `> 1y`, `unknown`
- **Visual**: horizontal stacked bar (one bar, segments per bucket), with a legend below. Total width 100%; segments sized by repo count.
- **Trust read**: high mass in the left two segments = healthy ecosystem; right-shifted = aging.

### Chart 3 — Repo age cohorts

When were the skill repos created. Battle-tested vs brand-new.

- **Source**: all active skills, grouped by repo
- **Buckets**: months since `repo_created_at`: `< 1mo`, `1-3mo`, `3-6mo`, `6-12mo`, `1-2y`, `> 2y`, `unknown`
- **Visual**: vertical bars, one per cohort
- **Trust read**: a wave of new repos in recent buckets confirms ecosystem growth; older buckets confirm longevity.

### Chart 4 — Top 15 owners by stars (leaderboard)

Who has the highest-starred repo in the registry.

- **Source**: all active skills; group by `owner`, take `MAX(stars)` and `COUNT(*)` per owner; sort by stars desc; limit 15
- **Visual**: horizontal bar list. Each row: owner name (mono link to `/orgs/{owner}`), bar (width proportional to log stars), star count (mono right-aligned). Skill count rendered as muted helper text.
- **Trust read**: lets users spot the high-trust owners worth following.

### Chart 5 — Installs vs stars (scatter)

Does GitHub popularity translate to npm installs? Divergence is the interesting part.

- **Source**: all active skills (one dot per skill, not per repo, since installs are per-package)
- **Visual**: SVG scatter, log-log axes. X = log(stars+1), Y = log(installs+1). Each dot is a small circle (`r=2`). Hover reveals a tooltip with skill name, owner, stars, installs.
- **Trust read**: dots above the diagonal = high stars + low installs (community endorsement, not yet adopted); dots below = high installs + low stars (workhorse skills, quietly used).

### Chart 6 — Skills per repo (distribution)

Some repos publish 1 skill, others publish 20+. Big bundles vs focused single-purpose repos.

- **Source**: all active skills, grouped by `(owner, repo)`, count skills per repo
- **Bins**: `1`, `2-3`, `4-9`, `10-24`, `25+` (5 bars)
- **Visual**: vertical bars
- **Trust read**: tells you the typical repo shape. If most repos publish 1 skill, the registry is fragmented. If many publish 10+, you're seeing curated bundles.

## Page layout

```
┌─────────────────────────────────────────────┐
│  Stats                                       │  Page header (mono 2xl/3xl, muted lede)
│  Trust signals across the registry.          │
├─────────────────────────────────────────────┤
│  Total skills · Repos · Owners · Avg stars   │  Summary strip (4 metric cells, mono)
├─────────────────────────────────────────────┤
│  ┌─Chart 1 ─────────────────────────────┐   │
│  │ Star distribution (skill repos)      │   │
│  │ [log-binned bars]                    │   │
│  └──────────────────────────────────────┘   │
│  ┌─Chart 2 ────────────┐ ┌─Chart 3 ─────┐   │  Two-column on lg, stack on mobile
│  │ Maintenance         │ │ Repo age     │   │
│  └─────────────────────┘ └──────────────┘   │
│  ┌─Chart 4 (full width) ────────────────┐   │
│  │ Top owners by stars                  │   │
│  └──────────────────────────────────────┘   │
│  ┌─Chart 5 ────────────┐ ┌─Chart 6 ─────┐   │
│  │ Installs vs stars   │ │ Skills/repo  │   │
│  └─────────────────────┘ └──────────────┘   │
└─────────────────────────────────────────────┘
```

Container: `max-w-5xl px-4 sm:px-6` (matches site convention).
Section padding: `py-12 md:py-16` (matches design guideline).
Chart card: `rounded-lg border border-default p-4 sm:p-5`, mono section label, then SVG.

## Design expressions

- **Quiet principle**: charts use `text-default` for bars, `text-muted` for axes/grid; no fills beyond border + 1 accent on hover. No gradients, no shadows.
- **Border-driven**: chart cards use the existing `border-default`; a thin baseline rule on each chart instead of a full grid.
- **Mono everywhere in chrome**: axis labels, tooltips, legends, summary metrics all `font-mono` with `tabular-nums`.
- **Progressive disclosure**: chart axes show only the bin labels you need; precise counts appear on hover (tooltip) or as small mono labels above each bar.
- **Single accent**: rose used only on hover state of bars/dots, and on the active filter chip if any.

## Testable behaviors

- `[C1]` GIVEN the page loads, WHEN the user visits `/skills/stats`, THEN the H1 reads "Stats" and there is a one-line lede beneath.
- `[C2]` GIVEN the API returns data, WHEN the page renders, THEN exactly 6 chart cards are visible, each with its own heading and SVG.
- `[C3]` GIVEN Chart 1 (star distribution), WHEN it renders, THEN the bars are restricted to repos whose `repo` name contains "skill" (case-insensitive), and the chart card shows a sub-label noting the filter.
- `[C4]` GIVEN any bar chart, WHEN the user hovers a bar, THEN the bar's border (or fill) shifts to the rose accent and a tooltip shows the exact count and bin label.
- `[C5]` GIVEN Chart 4 (top owners), WHEN the user clicks an owner name, THEN they navigate to `/orgs/{owner}`.
- `[C6]` GIVEN Chart 5 (scatter), WHEN the user hovers a dot, THEN a tooltip shows skill name, owner, stars, installs.
- `[C7]` GIVEN the API request is in flight, WHEN the page mounts, THEN each chart card shows a `USkeleton` placeholder sized to the chart's expected height (no layout shift).
- `[C8]` GIVEN the API errors, WHEN the page renders, THEN the user sees a single error block with copy "Couldn't load stats. Check your connection and try again." and a retry button. Individual charts do not show duplicated error states.
- `[C9]` GIVEN there are zero skills matching a chart's filter (e.g. zero skill repos), WHEN that chart renders, THEN it shows a small empty state inside the card ("No data yet."), not an empty SVG.
- `[C10]` GIVEN a viewport at 375px, WHEN the page renders, THEN charts stack one per row, summary metrics wrap to 2-up, and SVGs scale to container width without horizontal overflow.
- `[C11]` GIVEN a viewport at 768px, WHEN the page renders, THEN the two side-by-side rows (Chart 2/3 and Chart 5/6) display in two columns; Chart 1 and Chart 4 remain full-width.
- `[C12]` GIVEN dark mode (default), WHEN the page renders, THEN bars/axes use semantic tokens (`text-default`, `text-muted`, `border-default`); no hardcoded colors. Light mode passes the same check via the same tokens.
- `[C13]` GIVEN a screen reader, WHEN it lands on a chart, THEN it reads the chart heading, a one-sentence text summary of the data (e.g. "37 of 142 skill repos have between 100 and 999 stars"), and skips the SVG visuals (`aria-hidden="true"` on the SVG, accessible summary in a sibling element).
- `[C14]` GIVEN keyboard navigation, WHEN the user tabs through Chart 4, THEN each owner row is focusable and shows a focus ring matching the site default.
- `[C15]` GIVEN the page is fetched server-side (curl), WHEN the response HTML is inspected, THEN the page heading, lede, and the six chart card headings are present in the SSR HTML before hydration.
- `[C16]` GIVEN the user reloads the page, WHEN the page hydrates, THEN no console errors appear, and no hydration mismatches are reported.

## Out of scope

- Real-time updates (data is read once per page load; no polling)
- Filtering controls (e.g. exclude unofficial, time-range picker) — explicitly deferred
- Per-skill drill-down from a chart (Chart 5 hover shows name, but no click-through wired)
- Export / share / embed
- Caching layer beyond Nuxt's default `useFetch` behavior
- New navigation entry — this page is reachable directly via URL or future linking; we do not modify the global nav in this contract

## Files to be created/modified

**Created**:
- `app/pages/skills/stats.vue`
- `app/components/StatsBars.vue` (vertical bar chart primitive)
- `app/components/StatsHBar.vue` (horizontal stacked bar primitive)
- `app/components/StatsScatter.vue` (scatter plot primitive)
- `app/components/StatsLeaderboard.vue` (top-owners list)
- `server/api/skills/stats.get.ts`

**Modified**:
- `app/app.vue` — add a `Stats` mono link in the footer right slot, next to `Accessibility`

## Self-checks before handoff

- All bars/dots use semantic tokens, no hex literals
- Mono font on every numeric label
- All six charts render with empty/loading/error states wired
- Mobile: no horizontal overflow at 375px
- SSR: `curl /skills/stats` returns the headings in HTML
