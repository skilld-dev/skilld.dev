# Skill command toggle

## What will be built

Replace stacked run and install commands with one command and a two-option toggle. Show the collapsed Agent checklist only for installs.

## Testable behaviors

- [C1] GIVEN a Skill page, WHEN the command panel loads, THEN `One-Off` is selected and only the run command is visible.
- [C2] GIVEN the command panel, WHEN `Install` is selected, THEN the visible command and copy label switch to install.
- [C3] GIVEN install mode, WHEN `One-Off` is selected, THEN the visible command switches back to run.
- [C4] GIVEN one-off mode, WHEN copy is pressed, THEN the exact run command reaches the clipboard.
- [C5] GIVEN install mode, WHEN copy is pressed, THEN the exact install command reaches the clipboard.
- [C6] GIVEN a 375px viewport, WHEN the page renders, THEN the panel has no horizontal overflow and command text wraps.
- [C7] GIVEN a 1280px viewport, WHEN the sticky rail renders, THEN the command panel remains readable within its column.
- [C8] GIVEN dark mode, WHEN either mode is selected, THEN text and control states remain legible.
- [C9] GIVEN keyboard navigation, WHEN focus enters the toggle, THEN both modes expose pressed state and remain operable.
- [C10] GIVEN server rendering, WHEN the page HTML is generated, THEN it contains the default run command and no expanded Agent checklist.
- [C11] GIVEN a copy failure, WHEN the clipboard rejects the command, THEN the panel announces manual-copy guidance.
- [C12] GIVEN install mode, WHEN the checklist opens, THEN Agent guidance stays readable inside a bounded scroll area.
- [C13] GIVEN server rendering and hydration, WHEN receipt dates render, THEN their absolute timestamps match without warnings.

## Design expectations

Use the quiet editorial theme. Keep border-driven hierarchy, mono chrome, warm semantic surfaces, and 44px controls. Use progressive disclosure so one choice owns the command area.

## Out of scope

CLI grammar, repository-level install commands, search results, and Agent detection behavior.
