# Homepage work tracks: three rows

## What will change

- Keep the homepage work track grid at 12 cards.
- Merge Security and auth into Backend and data.
- Keep Anti-slop writing and Anti-slop coding as separate cards.
- Redirect the retired Security route to the combined Backend route.

## Testable behaviours

- [C1] GIVEN the work track taxonomy, WHEN the homepage builds its grid, THEN no more than 12 cards are available.
- [C2] GIVEN the merged taxonomy, WHEN slugs are inspected, THEN `anti-slop` and `anti-slop-coding` remain separate.
- [C3] GIVEN the combined Backend track, WHEN its membership is read, THEN it includes data modelling, security, and auth.
- [C4] GIVEN `/skills/security`, WHEN the route is requested, THEN it redirects permanently to `/skills/backend-data`.
- [C5] GIVEN all classifier categories, WHEN taxonomy checks run, THEN no classifier value belongs to two tracks.
- [C6] GIVEN the homepage route, WHEN Nuxt renders it, THEN the route loads without compile or server errors.

## Design expectations

- Keep the existing quiet editorial card design.
- Keep four equal columns at desktop width.
- Preserve existing responsive, focus, dark mode, and avatar behaviour.
- Follow the design principle: restraint and editorial clarity over visual impact.

## Out of scope

- New card styles or interactions.
- Changes to the two anti-slop routes.
- Changes to unrelated work tracks.
