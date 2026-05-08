# Build contract — skill detail page relayout

Job: `skills-slug-relayout-0429-1025`
Target file: `app/pages/skills/[...slug].vue`

## Scope

Restructure the page layout from a single 768 px (`max-w-3xl`) column with 16 stacked sections into a 1024 px (`max-w-5xl`) layout with a dense hero, a 2-column main+rail grid, and a tabbed discovery footer. Trust signals (provenance, recommended-by-N, signed ratio) are hero-resident. Curator quotes and capability panel move below SKILL.md so the content is reachable near the fold.

## What will be built

1. **Hero band** (full width, dense, ≤ ~30vh on desktop)
   - Identity column (lg col-span-7): avatar, skill name, tier badge, owner/repo link, GitHub description
   - Action column (lg col-span-5): installer tabs (`skilld` / `skills.sh`), install command with copy button, "Works with" agent compatibility badges (Claude Code · Codex · Cursor · Copilot · Gemini CLI), source action buttons (GitHub, skills.sh, Raw SKILL.md, Add to collection)
   - Below the two columns, a single dense data band: provenance line, stats line (stars · forks · maturity · "Recommended by N" + avatar stack), tag chips
   - Mobile: stacks single column, identity → install → data band → tags

2. **Main + rail grid** (below hero, lg+)
   - Main column (lg col-span-8):
     - SKILL.md content tabs (Preview / Markdown) ← first thing
     - Why curators picked this (full quotes list)
     - From the author (social embeds)
     - Community signal (social embeds)
     - What it does (AI summary)
     - Frequently asked (FAQ)
   - Rail column (lg col-span-4, `lg:sticky lg:top-4`):
     - Sticky install command repeat (compact)
     - Capability panel (compact)
     - Receipts (SkillReceiptsPanel)
     - Recent changes (top 4 commits + view-all link)
   - Mobile: rail items linearise after main, in order: install (omitted on mobile, hero command suffices) → capability → receipts → recent changes

3. **Discovery footer** (full width, below grid)
   - Single tabbed component consolidating the 4 current related-skills sections:
     - More from `{owner}/{repo}` (relatedRepoSkills)
     - Paired with (coOccurrenceSkills)
     - Similar skills (semanticSiblings)
     - Other by `{owner}` (relatedOwnerSkills)
   - Tabs hidden when underlying list is empty
   - 4-up grid at lg, 2-up at md, 1-up at sm

## Removed sections

- Standalone "Curators" full list (12+ entries with collection links) → replaced by hero avatar stack ("Recommended by N ◉◉◉◉ +X"). Empty state moves to hero.
- Standalone "Receipts" full-width section → moved into rail.
- 4 separate related-skills sections → collapsed into single tabbed footer.

## Testable behaviours

### Interaction
- **C1** GIVEN the page is loaded, WHEN the user clicks the `skills.sh` tab in the hero installer, THEN the install command swaps to the skills.sh form and `aria-selected` flips.
- **C2** GIVEN the page is loaded, WHEN the user clicks the copy button next to the install command, THEN the icon swaps to a check and the command is on the clipboard.
- **C3** GIVEN the page is loaded with multiple related-skills lists populated, WHEN the user clicks a non-default tab in the discovery footer, THEN the grid swaps to that tab's items.
- **C4** GIVEN the page is loaded, WHEN the user clicks the "All N allowed tools" disclosure in the rail capability panel, THEN the full tool list expands inline.
- **C5** GIVEN the page is loaded, WHEN the user clicks an avatar in the hero "Recommended by N" stack, THEN they navigate to that curator's profile.
- **C6** GIVEN the user has scrolled past the hero, WHEN they look at the right rail at `lg+`, THEN the install command panel remains visible (sticky).

### State
- **C7** GIVEN no API response yet, WHEN the page is rendering, THEN the hero shows skeleton placeholders for identity, description, and install row, with `aria-busy="true"`.
- **C8** GIVEN the API returns 404, WHEN the page renders, THEN it shows the "Couldn't find this skill" alert with a `Browse skills` button (no hero, no rail).
- **C9** GIVEN the skill has zero curators, WHEN the page renders, THEN the hero shows a "Be the first to curate this" CTA in place of the avatar stack and the "Why curators picked this" section is replaced with the existing empty-state copy.

### Responsive
- **C10** GIVEN viewport is 375 px, WHEN the page renders, THEN hero columns stack vertically, rail items linearise after main column, discovery grid collapses to 1-up.
- **C11** GIVEN viewport is 768 px (md), WHEN the page renders, THEN hero remains stacked (lg breakpoint controls 2-col), discovery grid is 2-up, rail still linearises after main.

### Dark mode
- **C12** GIVEN dark mode is active, WHEN the page renders, THEN all hero borders, install command code surface, rail panels, and tab indicators use the project's `--ui-*` tokens (no hardcoded `bg-white`/`text-black`/`slate-*`/`gray-*`/`zinc-*`).

### Accessibility
- **C13** GIVEN the page is loaded, WHEN keyboard-tabbing through the hero, THEN focus order is: back link → owner avatar → installer-tab `skilld` → installer-tab `skills.sh` → command (focusable code or skip) → copy button → GitHub → skills.sh → Raw → Add-to-collection → tag chips → "Recommended by" avatars. Each tab in the discovery footer must be reachable via keyboard.

### SSR
- **C14** GIVEN a bot user agent, WHEN the page is requested, THEN the rendered HTML contains the skill name, owner, install command, provenance line, and SKILL.md content before hydration (verified via `curl` + grep for `skill-heading`, `skilld add`, and a known SKILL.md heading).

## Design expectations

- Container: `max-w-5xl` matching `/orgs/[owner]` and `/people/[handle]`
- Tokens: `border-default`, `bg-muted/30`, `bg-elevated`, `text-default`, `text-muted` per design-guidelines.md. No hardcoded hex.
- Type: `font-mono` for chrome (install command, owner/repo, tags, data labels), `font-sans` for prose (description, SKILL.md preview, curator quotes)
- Radius: `rounded-lg` global, `rounded-md` for inline code/installer tabs
- Density: hero uses `gap-y-2`/`gap-y-3` for the data band; rail panels use `p-4`; main sections separated by `py-8` not `py-12`
- Trust hierarchy: provenance line and "Recommended by N" both render in mono at text-xs/sm; provenance carries `i-lucide-shield-check`; recommended-by carries an avatar stack with overlapping `-space-x-2 ring-2 ring-default`
- Compatibility badges: render as `UBadge` row, subtle variant, neutral color, mono font, with tooltip explaining the Agent Skills open standard
- Sticky install panel uses `lg:sticky lg:top-4` (not fixed) so it bounds at parent height
- Discovery tabs use `UTabs` with `variant="link"` matching the SKILL.md content tabs already in the page
- Design principle expressed: "quiet" through dense data lines instead of stacked panels, "progressive data discovery" through rail-localised metadata behind the SKILL.md content, "human warmth" through the avatar stack and rationale quotes

## Out of scope

- Adding new API fields (compatibility, install count history, etc.)
- Editing any component outside `app/pages/skills/[...slug].vue` (SkillReceiptsPanel, SocialEmbed, AddToCollection are reused as-is)
- Schema or backend changes
- Curator slide-over or sub-route for full curators list (the count + avatars in hero is the v1 surface)
- Mobile sticky bottom-sheet for install
- Compatibility data wiring (badges are static signals of Agent Skills open-standard support, not data-driven)