# Email settings build contract

## What will change

- The dashboard will show separate weekly email and monthly digest controls.
- Onboarding will explain and save both email choices.
- The obsolete custom cadence step and editor will be removed.

## Testable behaviour

- [C1] GIVEN a signed-in account, WHEN the dashboard loads, THEN both email choices are visible.
- [C2] GIVEN either choice changes, WHEN Save is pressed, THEN both choices persist.
- [C3] GIVEN both choices are off, WHEN the page reloads, THEN both remain off.
- [C4] GIVEN either choice is on without an address, WHEN Save is pressed, THEN a clear address error appears.
- [C5] GIVEN a valid address, WHEN Save is pressed, THEN the action shows progress and closes on success.
- [C6] GIVEN onboarding discovery completes, WHEN Continue is pressed, THEN email choices open next.
- [C7] GIVEN onboarding email choices save, WHEN Finish is pressed, THEN onboarding completes.
- [C8] GIVEN account data is loading, WHEN the dashboard renders, THEN existing query loading behaviour remains.
- [C9] GIVEN a save fails, WHEN the response returns, THEN the existing action failure toast appears.
- [C10] GIVEN no profile email, WHEN email settings render, THEN the address input stays editable.
- [C11] GIVEN a 375px viewport, WHEN settings render, THEN controls remain one column with 44px targets.
- [C12] GIVEN a 768px viewport, WHEN settings render, THEN controls use the existing dashboard rhythm.
- [C13] GIVEN dark mode, WHEN settings render, THEN only semantic design tokens supply colour.
- [C14] GIVEN keyboard navigation, WHEN focus moves through settings, THEN each control has a visible label.
- [C15] GIVEN server rendering, WHEN `/me` resolves, THEN both email labels exist in the HTML.

## Design expectations

Keep the existing compact editorial dashboard. Use semantic Nuxt UI tokens.
Prefer two plain checkbox rows over new cards or decorative status blocks.

## Out of scope

- New animation.
- New visual tokens.
- Per-person weekly recommendations.
- Custom monthly delivery times.
