# Polish — skill detail page (rail-only install)

Scope: `app/pages/skills/[...slug].vue`. Drop hero install action column (user: "the top hero variant does muddy up the hero a bit"). Promote rail install to be the single install surface; mirror it on mobile above SKILL.md.

## Changes

1. Hero loses the right-side action column entirely (installer tabs, install command + copy, "Works with" badge row, GitHub/skills.sh/Raw/AddToCollection ghost row). Hero becomes a single column: avatar + name + tier badge + owner/repo + description.
2. New mobile install section (`lg:hidden`) inserted after `<USeparator />`, before main+rail grid. Contains installer tab toggle, command + copy, "Works with" line, and secondary actions (GitHub/skills.sh/Raw/AddToCollection).
3. Existing rail install section (desktop, `hidden lg:block`) enriched to include installer tab toggle and secondary actions row. Card padding `p-3` → `p-4` to match DESIGN.md decision.
4. Token fixes:
   - Related-skill cards in discovery grid: `p-3` → `p-4` (DESIGN.md cards = p-4).
   - Recent-changes commit link: `hover:text-muted` (inverted dim-on-hover) → `hover:underline` (correct interactivity signal).

## Acceptance criteria

- [C1] Hero on desktop (≥1024px) renders identity column only — no installer code, no "Works with" badge row, no ghost link row.
- [C2] Mobile (375px) renders, in order: hero → USeparator → install panel (installer tabs + command + copy + secondary actions) → SKILL.md content.
- [C3] Desktop rail install panel (≥1024px) renders installer tab toggle, command + copy, "Works with" line, and ghost action row (GitHub/skills.sh/Raw/AddToCollection). Sticky at `top: 24px` on scroll.
- [C4] Installer tab toggle: clicking `skills.sh` swaps install command from `npx -y skilld add gh:owner/repo -s name` to `npx skills add owner/repo/name`. `aria-selected` flips.
- [C5] Copy button: clicking sets `aria-label` to "Copied" and clipboard receives the active install command.
- [C6] Secondary actions: GitHub link opens `data.githubUrl` (target=_blank); skills.sh link opens `data.url`; Raw link opens `/api/skills-raw/{slug}`; AddToCollection renders.
- [C7] Mobile no horizontal overflow at 375px — `scrollWidth === innerWidth`.
- [C8] Discovery grid cards render at `p-4` (DESIGN.md card padding decision).
- [C9] Recent-changes commit link: idle uses `text-default` (inherited), hover applies underline (no text-color inversion).
- [C10] Mechanical greps clean on changed file: 0 hex, 0 rgb/rgba/hsl, 0 slate/gray/zinc/stone, 0 bg-white/text-black, 0 rounded-xl.
- [C11] Dark mode: install card `border-default` and `bg-muted` resolve to OKLCH neutrals; copy button outline visible.
- [C12] SSR (bot UA): rendered HTML contains `id="skill-heading"` and one rendered install command.

## Out of scope

- Heading scale change (`text-xl` h1) — pending user decision.
- Copy button variant (outline → solid primary) — pending user decision.
- Entrance motion (`motion-v` reveals) — pending user decision.
- Section padding adjustments (current asymmetric pattern hits target gaps; DESIGN.md compliant in spirit).

## Design expectations

Hero feels editorial: identity reads first, install is one explicit decision below the fold (or in the rail on desktop). Matches DESIGN.md principle "the interface recedes; the curation speaks". Install panel earns the same treatment in both viewports — single source of truth, no duplicate "Works with" copy.
