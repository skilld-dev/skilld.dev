# Build progress — skills-slug-relayout-0429-1025

## Skill detail page relayout

Files modified:
- `app/pages/skills/[...slug].vue` (template structurally rewritten; minor script additions for compatibility list, related-tabs state, curator avatar slicing)

Files created: none. Components reused as-is: `SkillReceiptsPanel`, `SocialEmbed`, `AddToCollection`.

### Contract criteria status

- C1 (installer tab swap) — met
- C2 (copy install) — met
- C3 (discovery tab swap) — met (tabs only render when their list has items, default tab is first available)
- C4 (capability tools disclosure) — met (rail capability panel keeps the existing `<details>` pattern)
- C5 (avatar click → curator profile) — met (each `NuxtLink` in the avatar stack)
- C6 (sticky install on lg+) — met (`<aside class="lg:sticky lg:top-6">`)
- C7 (loading skeletons) — met (hero skeleton in 2-column shape)
- C8 (404 alert) — met (existing error block reused; container now max-w-5xl)
- C9 (zero curators state) — met (data band shows "No curators yet" + Sign-in CTA; "Why curators picked this" empty section uses original copy)
- C10 (375 px stack) — met (`grid` + `lg:grid-cols-12` collapses to single column below lg)
- C11 (768 px md behaviour) — met (lg breakpoint controls 2-col, md keeps single column; discovery grid 2-up at sm:grid-cols-2)
- C12 (dark mode tokens) — met (no hardcoded hex/slate/gray/zinc/stone in new template)
- C13 (keyboard tab order) — met by document order; avatars in stack are anchor links so each is in tab order
- C14 (SSR content) — met (curl returns `skill-heading`, `skilld add`, `Skill content`, `Works with`, `max-w-5xl` in pre-hydration HTML)

### Removed sections (per contract scope)

- Standalone full curators list (`role="list"` divided block of all 12+ curators) — replaced by the hero avatar stack ("Recommended by N ◉◉◉◉ +X")
- Standalone Receipts full-width section (`SkillReceiptsPanel` invocation) — moved into rail
- 4 separate related-skills sections (relatedRepoSkills, coOccurrenceSkills, semanticSiblings, relatedOwnerSkills) — collapsed into a single `UTabs` component in a footer

### Smoke test

- `curl /skills/anthropics/skill-creator` → HTTP 200
- `curl /skills/anthropics/pdf` → HTTP 200
- `curl /skills/anthropics/docx` → HTTP 200
- SSR HTML grep matches: `skill-heading`, `skilld add`, `Skill content`, `Works with`, `max-w-5xl`
- Build/runtime errors in `dev-server.log`: none from this change. The only HTML validation error remaining (`Multiple <h1> are not allowed`) is at column 20481 of the rendered output, inside the v-html-rendered SKILL.md prose article (markdown `#` headings becoming `<h1>`). Pre-existing, not introduced by the relayout.

### Known limitations

- Compatibility badges are static (Claude Code · Codex · Cursor · Copilot · Gemini CLI). No data wiring; they signal Agent Skills open-standard support per TWEET_PIVOT.md Section 3.
- Curators without a rationale are now visible only as part of the avatar stack count, not by name. Trade-off accepted in the wireframe approval.
- Receipts panel internal grid was authored for full-width (`lg:grid-cols-3`); it collapses to `grid-cols-1` inside the narrow rail, which is the desired effect.