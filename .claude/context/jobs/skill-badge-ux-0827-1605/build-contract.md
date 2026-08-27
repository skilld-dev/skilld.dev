# Skill badge UX contract

## What will be built

- A quiet README badge utility at the bottom of the skill metadata sidebar.
- A plain badge and an optional likes badge.
- The accessible label `Run on skilld.dev` on badge images and Markdown.

## Testable behaviors

- [C1] GIVEN any skill page, WHEN it renders, THEN the badge utility appears at the bottom of the metadata sidebar.
- [C2] GIVEN the badge utility, WHEN a reader views it, THEN one plain badge preview appears with alt text `Run on skilld.dev`.
- [C3] GIVEN the plain copy action, WHEN selected, THEN it copies Markdown without a likes query.
- [C4] GIVEN the likes copy action, WHEN selected, THEN it copies Markdown with `?likes=1`.
- [C5] GIVEN a plain badge request, WHEN served, THEN the SVG contains no like count.
- [C6] GIVEN a likes badge with a positive count, WHEN served, THEN the SVG shows the heart and count.
- [C7] GIVEN a likes badge with zero likes, WHEN served, THEN the SVG matches the plain visual.
- [C8] GIVEN an anonymous reader, WHEN the skill page renders, THEN the badge utility remains available without login.
- [C9] GIVEN keyboard or touch input, WHEN either copy action receives focus, THEN its target remains at least 44 pixels high.
- [C10] GIVEN mobile layout, WHEN sidebar metadata follows skill content, THEN the badge utility remains the final sidebar item.
- [C11] GIVEN dark or light mode, WHEN the badge utility renders, THEN it uses existing neutral text and border tokens.
- [C12] GIVEN server rendering, WHEN the skill page HTML is produced, THEN the plain badge preview and both copy actions exist.

## Design expectations

- Preserve the quiet editorial design and dense skill detail layout.
- Use a top hairline, muted mono copy, and no card around the utility.
- Keep the badge below provenance, history, and other skill evidence.
- Use no new color, spacing, shadow, or radius tokens.

## Out of scope

- Login gates or repository ownership checks.
- Editing a source repository README.
- Live badge refresh after a like changes in the open page.
