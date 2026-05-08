---
verdict: PASS
failed_criteria: []
failed_files: []
categories: []
---

## PASS — 2026-04-26 (re-review)

**URL:** http://localhost:3000/skills/stats

### Contract Scorecard
✅ PASS [C1]: H1 "Stats" + lede "Trust signals across the registry. Six views on what to install and who to follow." (`stats.vue:38-46`).
✅ PASS [C2]: 6 chart cards rendered (Star distribution, Maintenance freshness, Repo age, Top owners by stars, Installs vs stars, Skills per repo); each has h3 + visual.
✅ PASS [C3]: Chart 1 SQL filters `LOWER(repo) LIKE '%skill%'`; sub-label "Dedicated skill repos · 5350 repos · log bins" (`stats.vue:130`).
✅ PASS [C4]: Hovered bar swaps fill to `var(--ui-primary)`; tooltip below chart shows label, count, percent (`StatsBars.vue:91, 119-120`).
✅ PASS [C5]: Owner rows are `<NuxtLink :to="/orgs/${row.owner}">`; dev-browser confirmed first href = `/orgs/facebook` (`StatsLeaderboard.vue:50-55`).
✅ PASS [C6]: Scatter hover wired via `aria-live` region showing owner/name · stars · installs (`StatsScatter.vue:188-194`).
✅ PASS [C7]: Each card has `USkeleton` placeholder gated on `status === 'pending' && !data` at the rendered chart height (`stats.vue:133, 153-156, 173, 193-198, 217, 236`).
✅ PASS [C8]: Single error block with copy + Retry wired to `refresh()` (`stats.vue:97-118`); per-chart errors not duplicated.
✅ PASS [C9]: Each component renders a `No data yet.` block when total is zero (`StatsBars.vue:53`, `StatsHBar.vue:40`, `StatsScatter.vue:79`, `StatsLeaderboard.vue:32`).
✅ PASS [C10]: 375px viewport: zero horizontal overflow; charts stack 1-up; summary metrics use `grid-cols-2 sm:grid-cols-4`.
✅ **PASS [C11]** (was FAIL, fixed): 768px viewport positions confirmed via dev-browser — Maintenance/Repo age side-by-side (`left=24/392, width=352`), Installs/Skills-per-repo side-by-side (`left=24/392, width=352`), Star distribution + Top owners full-width (`width=720`). Tailwind `md:grid-cols-2` at `stats.vue:143, 207`.
✅ PASS [C12]: All bars/dots/axes use `var(--ui-text)`, `var(--ui-text-muted)`, `var(--ui-primary)`, `var(--ui-border)`. Mechanical greps for hex / rgb / hsl / `slate-|gray-|zinc-|stone-` / `bg-white|text-black` on all five new files: zero hits.
✅ **PASS [C13]** (was PARTIAL, fixed): SVGs in `StatsBars.vue:62` and `StatsScatter.vue:91` carry only `aria-hidden="true"` (redundant `role="img"` + `aria-label` removed). Sr-only summaries present and meaningful — confirmed live: "5351 total. Highest bin: 0 with 5285." and "11444 repos. Largest segment: unknown (99%)."
✅ PASS [C14]: Owner rows are native `<NuxtLink>` → `<a>`; site focus-visible CSS paints the rose ring.
✅ PASS [C15]: SSR `curl /skills/stats` returns H1 + all six h3s (`Star distribution`, `Maintenance freshness`, `Repo age`, `Top owners by stars`, `Installs vs stars`, `Skills per repo`) before hydration.
✅ PASS [C16]: dev-browser console: zero errors, zero pageerror events, no `nuxt-error` class.

**Repair-mode fixes verified:**
- C11: `lg:grid-cols-2` → `md:grid-cols-2` at `stats.vue:143, 207` ✅
- A11y: `role="img"` added to bar wrapper at `StatsHBar.vue:48` (was the `aria-prohibited-attr` axe violation) ✅
- A11y rubric: redundant `role="img"` + `aria-label` removed from `StatsBars.vue:62` and `StatsScatter.vue:91`; only `aria-hidden="true"` remains ✅

### Self-Assessment Comparison
- Generator confidence (after repair): high
- Generator-claimed weakest area: data sparsity in maintenance/age charts (`unknown` dominance until GH metadata sync runs). Verified accurate — sr-only summary now reads "Largest segment: unknown (99%)". Generator was honest; this is a data layer issue, not page code.
- All 16 criteria claimed `met`; independent verification confirms all 16 pass. No self-assessment failures this pass.
- The two prior failures (C11 and C13) appear in `repair_log` with correct file:line targets — the generator self-corrected from the prior review.

### Mechanical Greps (clean)
- TODO/FIXME/Lorem/placeholder/Coming soon: 0 hits across `app/pages/skills/stats.vue`, `app/components/Stats*.vue`, `server/api/skills/stats.get.ts`
- Hex / rgb / hsl literals: 0 hits
- `slate-|gray-|zinc-|stone-`: 0 hits
- `bg-white|text-black|border-gray`: 0 hits
- Off-system fonts (`font-inter|roboto|arial|system-ui`): 0 hits
- Custom non-`--ui-*` tokens added to `main.css`: 0 (handoff `design_system_changes: false` confirmed)

### Issues
None.

### Non-issues investigated
- axe-core ran with two `serious`/`moderate` violations: both targeted `div:nth-child(8)` (`<div style="position: fixed; bottom...">`) and `nuxt-devtools-frame .nuxt-devtools-label`. Both are Nuxt devtools UI chrome, not page code.
- Maintenance/age charts dominated by `unknown` (~99% of 11,449 repos): documented under `known_limitations`; flagged in the previous review as a UX-rubric concern. The previous reviewer opted not to hard-reject because the chart does render with what data exists and `next_steps` already prescribes running the GH sync. Carrying that decision forward — not a contract failure. Optional improvement: add an in-card hint when `unknown / total > 0.9`. Filed as advisory, not a blocking issue.

### What was verified
- SSR fetch of `/skills/stats` returns 200 with H1 + 6 chart h3s pre-hydration.
- `/api/skills/stats` returns 200.
- dev-browser: 768×1024 viewport positions confirm two-column side-by-side layout for Charts 2/3 and 5/6, full-width for Charts 1 and 4 (the C11 regression is gone).
- dev-browser: 375×812 viewport — zero horizontal overflow.
- dev-browser console + pageerror listeners: zero errors over full page lifecycle.
- axe-core scan (excluding devtools frames): zero page-code violations. The previous `aria-prohibited-attr` on StatsHBar is gone.
- Sr-only chart summaries render meaningful text (verified content of `.sr-only` siblings).
- Mechanical greps on all stats files: clean.

### Testing checklist
1. [ ] Resize browser to ~800px — confirm Maintenance/Repo age and Installs/Skills-per-repo render side-by-side; Star distribution + Top owners stay full-width.
2. [ ] Hover a bar in Star distribution — bar fill switches to rose, tooltip below shows label + count + percent.
3. [ ] Hover a maintenance segment — segment opacity bumps and corresponding legend swatch matches.
4. [ ] Tab through Top owners — every owner link gets the focus ring; Enter navigates to `/orgs/{owner}`.
5. [ ] Hover scatter dots — `aria-live` region updates with `owner/name · X stars · Y installs`.
6. [ ] Toggle dark mode while a bar is hovered — rose accent persists, contrast remains readable.
7. [ ] Block `/api/skills/stats` in DevTools and reload — single error block + Retry button only (no per-chart duplication); click Retry restores.
8. [ ] At 375px scroll the page — no horizontal overflow on any chart.

### Areas I'm less confident about
- VoiceOver/JAWS read-out of sr-only summaries was not directly tested; only structural a11y via axe-core.
- Maintenance + age charts: the page is correct, but the visual signal is weak until the GH metadata sync runs (`scripts/sync-skills-gh-all.sh`). Already in `next_steps`.

### Decision Log
- C1–C10, C12, C14–C16: re-graded; positive evidence in HTML, browser, mechanical grep. PASS.
- C11: previous FAIL — re-verified via dev-browser at 768×1024; six articles now lay out as `[full] [half/half] [full] [half/half]`. Fix at `stats.vue:143, 207` matches the contract. PASS.
- C13: previous PARTIAL — re-verified `StatsBars.vue:62` and `StatsScatter.vue:91`; SVGs carry only `aria-hidden="true"`; redundant role/aria-label removed; sr-only summaries still rendered. PASS.
- StatsHBar `aria-prohibited-attr`: re-verified — `role="img"` is now on the `<div class="relative h-3 …">` at `StatsHBar.vue:48`. axe scan confirms the violation is gone. PASS.
- Devtools chrome axe noise: explicitly excluded; not page code.
- Data sparsity advisory: carried forward as advisory, not a contract failure (matches prior reviewer).

### Next Steps
All criteria met. Ready to ship.

Optional follow-ups:
- Run `scripts/sync-skills-gh-all.sh` so maintenance + age charts carry signal before this is publicly linked.
- If the unknown-dominance is unacceptable for first-impression UX, add an in-card hint when `unknown / total > 0.9` (not blocking).