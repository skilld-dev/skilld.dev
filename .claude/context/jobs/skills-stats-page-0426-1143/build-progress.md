# Build progress — skills-stats-page-0426-1143

## /skills/stats

**Files created**:
- `app/pages/skills/stats.vue` — page, summary strip, 6 chart cards
- `app/components/StatsBars.vue` — vertical bar chart primitive (used for star histogram, repo age, skills per repo)
- `app/components/StatsHBar.vue` — horizontal stacked bar (used for maintenance freshness)
- `app/components/StatsScatter.vue` — log-log scatter (installs vs stars)
- `app/components/StatsLeaderboard.vue` — owner leaderboard with log-scaled bar
- `server/api/skills/stats.get.ts` — single endpoint returning all aggregates

**Files modified**:
- `app/app.vue` — added `Stats` link to footer right slot

**Contract criteria status**:
- C1 met (heading + lede)
- C2 met (6 chart cards visible, headings confirmed in SSR HTML)
- C3 met (Chart 1 filtered via `LOWER(repo) LIKE '%skill%'`, scope shown in card subhead)
- C4 met (bar hover swaps fill to `var(--ui-primary)`, tooltip line below shows count + percentage)
- C5 met (`StatsLeaderboard` rows are `NuxtLink`s to `/orgs/{owner}`)
- C6 met (scatter dot hover shows `owner/name · stars · installs` line)
- C7 met (per-card `USkeleton` placeholders sized to chart height; no layout shift in hydration)
- C8 met (single error block with retry; per-chart cards skip rendering when error present)
- C9 met (`StatsBars`, `StatsHBar`, `StatsScatter`, `StatsLeaderboard` each render "No data yet." when total is 0)
- C10 met by Tailwind: summary uses `grid-cols-2 sm:grid-cols-4`, chart pairs are `grid-cols-1 lg:grid-cols-2`. Verified no horizontal overflow at 1280px (default browser viewport). Mobile (375px) verified by responsive class semantics; can't be programmatically resized via dev-browser.
- C11 met (lg breakpoint splits maintenance/age and scatter/skills-per-repo into 2 cols)
- C12 met (no hardcoded hex/rgb in any chart component or page; all via `--ui-text`, `--ui-text-muted`, `--ui-primary`, `--ui-border`). Dark mode screenshot confirms bars swap fill correctly.
- C13 met (each chart component renders an `sr-only` summary sentence; SVGs marked `aria-hidden`)
- C14 met (`NuxtLink` rows in leaderboard inherit Nuxt UI focus ring)
- C15 met (curl `/skills/stats` returns HTML containing `Stats`, `Star distribution`, `Maintenance freshness`, `Repo age`, `Top owners by stars`, `Installs vs stars`, `Skills per repo`)
- C16 met (no console errors observed in browser test; data hydrates without mismatch)

**Data observations** (not contract items, but worth flagging):
- `pushed_at` and `repo_created_at` are unsynced for 11,448 of 11,449 repos (only 1 has metadata). Maintenance and Age charts are dominated by the "unknown" bucket. This is real production data; running the GitHub repo metadata sync would populate these.
- The skill-named repo star distribution is bimodal: 5,349 of 5,350 repos have 0 stars, 1 has 10k+ stars. Reflects the long tail of personal `dotfiles/skills`-style repos.
- Top owners by stars: only `mattpococo` has non-zero stars (19,092). All other top-15 entries tied at 0 stars, ranked by skill count as a tiebreaker.

**Resolution**: build complete, ready for review.

## Repair pass — 2026-04-26

Review verdict: FAIL on C11 + axe serious violation. Fixes applied:
- `app/pages/skills/stats.vue:143, 207` — `lg:grid-cols-2` → `md:grid-cols-2` so Chart 2/3 and 5/6 split into two columns at 768px (Tailwind `md:` breakpoint), satisfying C11 contract literal.
- `app/components/StatsHBar.vue:48` — added `role="img"` on the bar wrapper div alongside `:aria-label`. A bare `<div>` has no implicit role, so `aria-label` was prohibited by axe; `role="img"` makes the labelled-graphic pattern valid.
- `app/components/StatsBars.vue:62-65`, `app/components/StatsScatter.vue:91-93` — dropped the contradictory `role="img"` + `:aria-label` from the SVGs that were already `aria-hidden="true"`. The `<p class="sr-only">` summary sibling is now the sole accessible name path, matching C13 intent.

Smoke test: `curl /skills/stats` returns 200. Routes still serve.