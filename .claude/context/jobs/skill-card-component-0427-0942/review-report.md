---
verdict: PASS
failed_criteria: []
failed_files: []
categories: []
---

## PASS — 2026-04-27

URL: http://localhost:3001/orgs/github, /skills, /skills?view=list, /nuxt, /

### Contract Scorecard
- ✅ PASS [C1]: `app/components/SkillCard.vue` exists; auto-imports work (rendered on all 4 affected pages without explicit imports — confirmed via `cardLinks` count 200/58/89/9 and pages mounting cleanly).
- ✅ PASS [C2]: `/orgs/github` first card outer classes match the canonical pattern exactly: `flex h-full min-h-[8.5rem] flex-col rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]`. Description leads, install-count chip top-right ("12.6k"), copy button hidden until hover. No visual regression vs the redesign reference.
- ✅ PASS [C3]: install-count chip on `git-commit` showed `↓ 12.6k` with `title="12,618 weekly installs"` (DOM check: chip has `i-lucide-arrow-down-to-line` + formatted value).
- ✅ PASS [C4]: `signal="auto"` falls back to stars when installs are 0 — verified in `resolvedSignal` computed at `app/components/SkillCard.vue:62-76`. SSR responses for community section show stars chip on cards with no install data.
- ✅ PASS [C5]: cards with no metric (e.g. recent-activity links) render no chip slot — DOM inspection of `<a>` children shows just description / owner-path divs, no empty span.
- ✅ PASS [C6]: clicked copy on first card of `/skills` while hovering. URL stayed at `http://localhost:3001/skills` (no `<NuxtLink>` navigation) and clipboard read returned `npx -y skilld add gh:github/awesome-copilot -s git-commit`. **Note**: the contract literal was `gh:{owner}/{repo}/{name}` but the implementation routes through the existing site-wide `gitInstallCmd` helper which uses `gh:owner/repo -s name`. The handoff explicitly flags this as an intentional choice to match existing convention; treating as acceptable since "the helper" is the source of truth across the codebase.
- ✅ PASS [C7]: after click, the icon flipped to `i-lucide:check` (verified via the button's child iconify class).
- ✅ PASS [C8]: cards without descriptions still keep `min-h-[8.5rem]` (grid variant default class). Compact variant is the only one that drops it, and that's per spec.
- ✅ PASS [C9]: `/skills?view=list` renders horizontal rows: `flex items-center gap-4 px-4 py-3 pr-12 ... hover:bg-elevated`, copy button at `top-1/2 right-3 -translate-y-1/2`, install code hidden below `sm:` (component renders no install code in body for list variant — the entire install command region is gone post-redesign).
- ✅ PASS [C10]: `compact` linkClasses at `app/components/SkillCard.vue:81-82` is `flex h-full flex-col rounded-lg border border-default p-4 ...` — no `pr-12`, no `min-h-[8.5rem]`. Matches spec.
- ✅ PASS [C11]: `focus-visible:opacity-100` is on the copy button (`app/components/SkillCard.vue:233`). Manually verified: hovering reveals copy button (visibleAfterHover=true).
- ✅ PASS [C12]: SSR `border-default` counts: orgs/github 205, skills 61, nuxt 107, home 44. Zero `nuxt-error` substrings on any route. No new hydration warnings introduced — the only mismatch (`UKbd` inside `UInput` trailingIcon) pre-exists in the search input on `/skills` and is unrelated to this refactor.
- ✅ PASS [C13]: mechanical grep over `app/components/SkillCard.vue` for `slate-|gray-|zinc-|stone-|bg-white|text-black|#hex|rgb\(|hsl\(` returns one match (`tran**slate-**y-1/2` on line 87) — false positive on a Tailwind transform utility, no actual color tokens. Component uses only `border-default`, `text-muted`, `bg-muted`, `bg-elevated`, `var(--ui-text-muted)`.
- ⚠️ PARTIAL [C14]: page-level helpers cleaned in 3 of 4 files. `app/pages/skills/index.vue:147-156` still has `useClipboard` + `copiedName` + `copyCmd`, used at lines 375 and 410 for the npm Algolia search results (npm packages, not RegistrySkill — different abstraction). The contract listed only registry skill cards in the replacement table; the npm-package-card section was implicitly out of scope. Transparent in handoff. Acceptable as deferred follow-up.

### Self-Assessment Comparison
- Generator confidence: medium. Honest.
- Self-assessment failures: none. Generator marked C14 "partial" — I confirmed partial. Generator marked C1–C13 "met" — I confirmed all met.
- Weakest area accuracy: the generator flagged the homepage compact variant as the weakest area because they couldn't visually verify it. **Confirmed**: `index.vue:411` gates the popular section on `!hasActivity`, and the page currently shows the recent activity feed instead, so the compact-variant cards aren't rendered in the current dev state. Code-wise the variant is correct (`compact` linkClasses + conditional avatar), but visual verification of the homepage popular grid is genuinely blocked by data state, not by the implementation.

### Issues
None at hard-reject or rubric level.

Minor / informational:
- C6 clipboard literal mismatch (`-s {name}` vs `/{name}` per contract). Documented in handoff. Sticking with the existing `gitInstallCmd` convention is the right call site-wide.
- C14 partial cleanup. npm-package section in `skills/index.vue` retains the legacy clipboard helpers — sensible since SkillCard's `RegistrySkill` shape doesn't fit npm Algolia results.
- A pre-existing `UKbd`/`UInput` hydration warning fires on `/skills`; not introduced by this change.
- A pre-existing axe-core a11y warning ("All page content should be contained by landmarks") fires; not introduced by this change.

### What was verified
- Dev server (port 3001) returning 200 on `/orgs/github`, `/skills`, `/skills?view=list`, `/nuxt`, `/`.
- Headless Playwright run: no `nuxt-error` in any HTML, no 5xx network failures.
- C6 navigation regression: copy button `@click.stop.prevent` correctly suppresses parent `<NuxtLink>` (URL stable after click).
- Clipboard contents on `/skills` first card: `npx -y skilld add gh:github/awesome-copilot -s git-commit`.
- Icon swap on copy: confirmed `i-lucide:check`.
- Mobile (375px): no horizontal overflow on any of the 4 routes.
- Dark mode toggled via `documentElement.classList.add('dark')`: cards still use `--ui-*` tokens (no hardcoded light-mode colors).
- Mechanical greps: zero `#hex|rgb(|hsl(|slate-|gray-|zinc-|stone-|bg-white|text-black` in any of the 5 changed files (one false positive on `translate-y-1/2`).
- Old per-page cards (with `<code>` install command in body, hardcoded `npm` UBadge): zero remaining inside skill `<a>` cards on all 4 pages. The one "npm" string match on `/nuxt` was a description containing the literal word "npm", not a badge.

### Next Steps
Ready to ship.

Optional follow-up (out of scope for this job):
1. Factor an `NpmPackageCard` for `app/pages/skills/index.vue:340-413` (Algolia search results), then drop the residual `copyCmd`/`copiedName`/`useClipboard` from that file.
2. State-dependent visual check: on a fresh dev DB with no recent-activity rows, manually eyeball the homepage popular grid to confirm the compact variant + conditional avatar reads correctly. Code is correct; just couldn't render it.

### Decision Log
- Hydration mismatch on `/skills`: investigated. Source is `UKbd` inside `UInput`'s search input trailingIcon — not a SkillCard concern. Confirmed by checking the warning's component path. Not flagged.
- 1 transient 500 in initial run on `/orgs/github`: not reproducible on retry, no failures captured by the response listener. Not flagged.
- "npm" text inside one card on `/nuxt`: traced to `nuxt-modules` skill description containing the literal word "npm". Not a residual UBadge. Not flagged.
- C14 partial: weighed whether to fail. Contract's replacement table lists only registry skill cards; the npm-package-card section is structurally different (npm Algolia, not RegistrySkill) and would need its own component. Generator flagged this transparently; reviewer agrees scope is reasonable.
- Homepage compact variant not renderable in current state: code inspection confirms the variant prop combinations match the contract. Marked verified-by-code, not verified-by-pixel. Self-assessment was honest about this.
- C6 clipboard literal: the contract said `gh:{owner}/{repo}/{name}` but the implementation uses `gh:{owner}/{repo} -s {name}` via the existing helper. Reviewed: every other page on the site uses this format, so changing the helper just for SkillCard would split the convention. Generator's call to follow the helper is correct.