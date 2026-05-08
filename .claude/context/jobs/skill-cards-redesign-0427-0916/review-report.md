---
verdict: PARTIAL
failed_criteria: []
failed_files: [app/app.vue:179]
categories: [out-of-scope-regression]
---

## PARTIAL — 2026-04-27

Contract scope (`/orgs/[owner]` skill cards) is **clean**. All 12 contract criteria met with positive SSR evidence. Withholding PASS because an unrelated typo in `app/app.vue:179` ("People" → "Peopled") sits in the same dirty working tree and will ship if committed alongside this work.

### Contract Scorecard

✅ **PASS [C1]**: SSR for `/orgs/github` contains 200 cards, each with name, description (`line-clamp-3`), and `arrow-down-to-line` install-count chip; no `gitInstallCmd` `<code>` block remains.
✅ **PASS [C2]**: Copy button in markup at `app/pages/orgs/[owner].vue:505-513`; `@click.stop.prevent` correctly added so the button no longer navigates the parent `<NuxtLink>` (this was a real bug pre-fix and is now solved).
✅ **PASS [C3]**: `v-if="skill.description"` at `:499` guards description; `min-h-[8.5rem]` on the link at `:479` reserves grid height when missing.
✅ **PASS [C4]**: `v-if="skill.installs > 0"` at `:486` correctly hides the chip on zero installs.
✅ **PASS [C5]**: `<NuxtLink :to="skillPath(skill)">` at `:476-477` preserved.
✅ **PASS [C6]**: `focus-visible:opacity-100` retained on the absolute-positioned copy button at `:510`.
✅ **PASS [C7/C8]**: `grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3` at `:468`; `flex items-start justify-between` row keeps chip right-aligned without wrapping.
✅ **PASS [C9/C10]**: Mechanical greps for `slate-|gray-|zinc-|stone-|bg-white|text-black|#hex|rgb\(|hsl\(` against the new block returned **zero hits**. Only `var(--ui-text-muted)` used.
✅ **PASS [C11]**: `line-clamp-3 leading-relaxed` at `:500`.
✅ **PASS [C12]**: `curl /orgs/github` HTML contains 200 instances of `line-clamp-3` and 200 of `font-mono text-sm font-medium` — descriptions and names render server-side.

### Self-Assessment Comparison

- **Generator confidence**: high → **accurate** for in-scope work.
- **Weakest area identified**: empty-description / zero-install branches verified only by code-reading. → I confirmed the `v-if` guards by inspection, same as the generator. Not independently exercised; valid limitation, but the guards are trivially correct.
- **Self-assessment failures**: none on the contract.
- **Hardest decision** (drop the per-card `npm` badge): well justified in the contract; consistent with the "Quiet principle" and the documented mislabel issue (`gh:` skills wearing an `npm` label).

### Issues Found

#### [HARD REJECT] copy-typo: "People" link mistyped as "Peopled" in global header

- **File**: `app/app.vue:179`
- **Evidence**: `git diff HEAD -- app/app.vue` shows `-label="People"` / `+label="Peopled"`. This file is **not** in the handoff's `pages_changed` and is **not** referenced by any contract criterion, but it's modified in the same working tree as the orgs page. Any commit grouping these files will ship the typo to the global header on every page (including `/orgs/github`, the route under review). Confirmed not yet HMR'd into the running dev server (served HTML still shows "People"), so this hasn't been visually surfaced during the build.
- **Contract criterion violated**: out of scope; flagged as adjacent regression.

### What I verified

- Read full handoff + contract; schema_version `4` ✓.
- Diff vs `git_hash` `ba95d74` — only `app/app.vue` (1 line) and `app/pages/orgs/[owner].vue` (~24 lines net) touched.
- Mechanical greps for forbidden colors / fonts / TODO markers on changed lines — clean.
- `--ui-*` token usage only; no parallel custom tokens introduced; `data-label` is an existing utility (`app/assets/css/main.css:111`).
- Dev server already running on `:3001`; `curl /orgs/github` returns 200, no `nuxt-error`, 354 lines of HTML, 200 cards rendered SSR with new markup.
- Confirmed the new `@click.stop.prevent` on the copy button — without it, clicking the copy icon would also trigger the parent `<NuxtLink>` navigation. Genuine fix, not just markup churn.
- Hardcoded color audit: only `var(--ui-text-muted)` used in the new card; no `slate-/gray-/zinc-/stone-/bg-white/text-black/#hex/rgb(/hsl(` matches.

### Areas I'm less confident about

- **Real visual verification skipped**: scope-gate triggered (≤2 files, <20 net lines on the in-scope file). I did not screenshot at 375 / 768 / 1280 or run axe-core. The grid/min-height changes are simple enough that SSR + grep covers them, but if you want screenshot evidence, run `dev-browser --headless` against the three routes_to_test.
- **Empty-state branches** (`description == null`, `installs === 0`) verified by code reading. The github org has descriptions+installs on every skill, so the v-if branches were not exercised in practice. Try `/orgs/anthropic-developers` or `/orgs/skilld` if either has zero-install skills to confirm visually.

### Testing checklist

1. [ ] **Fix the typo** in `app/app.vue:179` (`Peopled` → `People`) before committing this branch, or commit the orgs page in isolation.
2. [ ] Visit `/orgs/github`, `/orgs/anthropic-developers`, `/orgs/skilld` — confirm each card shows name + description + install chip, no install command visible.
3. [ ] Hover a card — copy button fades in top-right; install chip fades out (group-hover:opacity-0).
4. [ ] Click the copy button — clipboard contains `npx -y skilld add gh:owner/repo/name`; icon flips to check; **page does NOT navigate** (the `.stop.prevent` fix).
5. [ ] Tab to a card — copy button visible via focus-visible; tab again moves to next card.
6. [ ] Resize to 375px — single column, chip stays right-aligned, no horizontal scroll.
7. [ ] Toggle dark mode — borders, text, hover states all adapt; no white/black flashes.
8. [ ] Find an org with a skill that has `installs === 0` (or temporarily hardcode one) — chip is omitted, card height still matches neighbors via `min-h-[8.5rem]`.

### Next steps

> The contract work is ready. Fix the unrelated `Peopled` typo in `app/app.vue:179` (or stage only `app/pages/orgs/[owner].vue` for this commit) and ship.
>
> If you want full visual verification before merging, re-run `/nuxt-frontend-review skill-cards-redesign-0427-0916` after fixing the typo and I'll run dev-browser screenshots + axe.

### Decision Log

- **C1–C12 grading**: each criterion mapped 1:1 to a line in `app/pages/orgs/[owner].vue:467-515`. No criterion graded by inference; all by either grep-against-rendered-HTML or by direct file inspection.
- **`Peopled` typo**: considered marking out-of-scope-and-skip, decided to surface as PARTIAL because (a) it lives in the same dirty working tree, (b) it ships in the global header on every route under review, and (c) the reviewer's job is to catch what would ship, not just what was contracted.
- **Scope gate**: triggered (2 files, ~25 lines net). Skipped browser screenshots; ran SSR + grep instead. Re-examined the three highest-complexity changes (`@click.stop.prevent`, the chip's `group-hover:opacity-0`, and the `min-h-[8.5rem]` empty-state padding) under the suspicion-check rule and found them all defensible.
- **`group-hover:opacity-0` on the chip**: initially considered flagging — the chip and copy button cross-fade in the same top-right region. Decided this is intentional (chip = passive metadata, copy = action; same affordance slot, mode-switched on hover) and matches the contract diagram. Not a defect.
