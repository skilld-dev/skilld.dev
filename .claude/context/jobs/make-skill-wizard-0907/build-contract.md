# Make a skill wizard

Choose the ecosystem where developers get the package.
Enter its name or package link, then open that ecosystem's authoring guide.
The package manager used for local development does not change this choice.

## Acceptance criteria

- [C1] Make a skill links open the wizard from desktop navigation, mobile navigation, homepage, and Learn.
- [C2] The first step offers npm, PyPI, crates.io, Go modules, and RubyGems.
- [C3] Each choice shows its language, input example, and guide contents.
- [C4] A valid package name or package link opens the matching guide with normalized package context.
- [C5] Invalid input shows an associated error and retains focus without navigating.
- [C6] Change ecosystem and browser Back preserve entered package text.
- [C7] The guide shows copyable agent instructions with the selected package and manifest.
- [C8] Each guide explains its ecosystem's file inclusion and release checks.
- [C9] Direct guide visits and the skip link work without package context.
- [C10] Change setup restores the selected ecosystem and package.
- [C11] Navigation shows busy feedback. Clipboard failure remains visible and recoverable.
- [C12] Controls fit at 375px and 768px. Long package names do not cause overflow.
- [C13] Light and dark modes retain readable text and visible focus. Controls have 44px targets.
- [C14] Native form submission works before hydration. Server HTML includes guide context.

## Design

Use warm stone surfaces, rare rose actions, mono controls, and rounded-lg borders.
Keep two steps, one question per step, and an explicit destination on the final action.
Show the guide contents before asking the user to continue.

## Scope

Support the five ecosystems already shown on the homepage.
Write separate guides for their real publishing differences.
Package input personalizes instructions; it does not perform a package lookup.
The wizard does not publish packages or write Skill files.
