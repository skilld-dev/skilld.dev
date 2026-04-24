# Build Contract: Skill Detail Page Completion

## What will be built

Enhance `app/pages/skills/[...slug].vue` with GitHub repository data fetched via ungh.cc API. Modify `server/api/skills/[...slug].get.ts` to fetch and return repo metadata.

### Changes

1. **Server API** (`server/api/skills/[...slug].get.ts`): Add parallel fetch to `ungh.cc/repos/{owner}/{repo}` for description, stars, forks, pushedAt. Cache response.
2. **Page template** (`app/pages/skills/[...slug].vue`): Add description, stats row (stars, forks, last updated), improve layout with progressive disclosure.

## Testable behaviors

- [C1] GIVEN skill detail page loads, WHEN data returns, THEN repo description is displayed below the skill name
- [C2] GIVEN skill detail page loads, WHEN data returns, THEN stars count is visible as a data-label
- [C3] GIVEN skill detail page loads, WHEN data returns, THEN forks count is visible as a data-label
- [C4] GIVEN skill detail page loads, WHEN data returns, THEN "last updated" relative time is visible
- [C5] GIVEN the API request is pending, WHEN page renders, THEN skeleton loaders show for stats area
- [C6] GIVEN ungh.cc fetch fails, WHEN page renders, THEN page still displays skill data (graceful degradation)
- [C7] GIVEN viewport is 375px wide, WHEN page renders, THEN stats row wraps without overflow
- [C8] GIVEN viewport is 768px, WHEN page renders, THEN stats display inline
- [C9] GIVEN dark mode, WHEN page renders, THEN all new elements use semantic tokens (no hardcoded colors)
- [C10] GIVEN the page, WHEN tabbing through, THEN all interactive elements are reachable in logical order
- [C11] GIVEN SSR, WHEN page HTML is returned, THEN description and stats are present in initial HTML (when not lazy)
- [C12] GIVEN a skill in a multi-skill "skills" repo, WHEN page renders, THEN repo name shows as "{owner}/skills"
- [C13] GIVEN a skill in a dedicated repo, WHEN page renders, THEN repo name shows as "{owner}/{repo}"

## Design expectations

- Stats row uses `.data-label` utility, compact inline layout
- Description in `text-sm text-muted`, max 2 lines
- Stars/forks icons from lucide (i-lucide-star, i-lucide-git-fork)
- Follows quiet principle: stats are supplementary, not prominent
- Border-driven layout, no shadows or glow

## Out of scope

- Markdown rendering for SKILL.md content
- README fetching from ungh.cc
- Release/contributor data
- Install count display changes
