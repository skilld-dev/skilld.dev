# Build progress — skill-cards-redesign-0427-0916

## /orgs/[owner] (skill cards inside repo grouping)

### Files modified
- `app/pages/orgs/[owner].vue:84-91` — added `formatCount` helper (`12.6k`, `1.2M` style with always-precision)
- `app/pages/orgs/[owner].vue:471-514` — replaced per-skill `<NuxtLink>` markup; removed `<UBadge label="npm">` and the `<code>` install command; added install-count chip; promoted description from line-clamp-2 to line-clamp-3; added `min-h-[8.5rem]` + `flex flex-col` so cards keep uniform height when descriptions vary; added `@click.stop.prevent` on the copy button to keep it from triggering NuxtLink navigation.

### Contract criteria
- C1 met (cards show name + description + install count, no inline install command)
- C2 met (hover + click on copy button copies install command, icon flips to check; verified via dev-browser)
- C3 met (`v-if="skill.description"` guards display; `min-h-[8.5rem]` keeps grid even when omitted)
- C4 met (`v-if="skill.installs > 0"` hides chip)
- C5 met (NuxtLink to `skillPath` preserved; `.stop.prevent` on copy button isolates the click)
- C6 met (existing `focus-visible:opacity-100` preserved on copy button)
- C7 met (375px: 1-column stack, name + chip on same row — verified visually)
- C8 met (768px: 2-column grid, uniform row heights — verified visually)
- C9 met (dark mode: `border-default`, `text-muted`, `--ui-text-muted` hover all token-based — verified visually)
- C10 met (no slate-/gray-/zinc-/bg-white/text-black/hex literals in new markup)
- C11 met (`line-clamp-3` + `leading-relaxed`; full description on detail page via NuxtLink)
- C12 met (SSR HTML contains "Execute git commit…" before hydration; verified via curl + grep)

### Verification
- `curl -sf http://localhost:3001/orgs/github` → 200, 492KB, 0 per-skill install commands found, 1 repo-level install command preserved
- Dev-browser screenshots: default / hover / 375px / 768px / dark mode all render as designed
- 12,589 weekly installs (`title` tooltip) appears on `git-commit` card