# Missing skill search recovery

## What will be built

The missing state in `SkillDetail.vue` will search the registry using the missing Skill name.
It will show up to three live matches with source details and direct links.

## Testable behaviours

- [C1] GIVEN a missing Skill with a matching live Skill, WHEN the page loads, THEN the closest match is visible.
- [C2] GIVEN a visible match, WHEN its link is followed, THEN the live Skill route opens.
- [C3] GIVEN search results, WHEN “View all matches” is followed, THEN `/skills` opens with the derived query.
- [C4] GIVEN any missing Skill, WHEN “Browse skills” is followed, THEN the Skill directory opens.
- [C5] GIVEN any Skill page, WHEN “All skills” is followed, THEN the Skill directory opens.
- [C6] GIVEN matching search is pending, THEN the recovery area announces that it is searching.
- [C7] GIVEN matching search fails, THEN the recovery area offers a scoped retry.
- [C8] GIVEN matching search finds nothing, THEN the recovery area says no similar Skills were found.
- [C9] GIVEN a 375px viewport, THEN result metadata wraps without horizontal overflow.
- [C10] GIVEN a 768px viewport, THEN actions and match details use the available width.
- [C11] GIVEN dark mode, THEN the recovery area uses semantic background, text, and border tokens.
- [C12] GIVEN keyboard navigation, THEN every result and action has a visible focus indicator and a 44px target.
- [C13] GIVEN a server rendered missing Skill with matches, THEN the HTML contains the recovery heading and first match.

## Design expectations

Use the quiet editorial system in `DESIGN.md`.
Keep the Skill detail density, border hierarchy, mono chrome, and warm semantic surfaces.
Use no new colors, shadows, tokens, or decorative content.

## Out of scope

- Changing registry ranking.
- Adding redirects for guessed matches.
- Changing the global search panel.
- Changing the status code of unrelated missing routes.
