# Make a skill wizard

Build `/make-skill` with package manager selection, package input, and navigation to the existing authoring guide.
The guide uses the selected manager and package for its command and agent instructions.
Desktop navigation, mobile navigation, and the homepage authoring link open the wizard.

## Acceptance criteria

- [C1] Opening Make a skill shows npm, pnpm, Yarn, and Bun.
- [C2] Choosing a manager shows the package input and selected manager.
- [C3] Back returns to manager selection and preserves the package input.
- [C4] Submitting a scoped or unscoped package opens the guide with both selections.
- [C5] Empty or invalid package names show an input error without navigating.
- [C6] The guide shows the selected manager's command and package-specific agent instructions.
- [C7] Change setup returns to the wizard with both selections filled.
- [C8] Direct guide visits retain useful default instructions. Invalid query values never enter commands.
- [C9] Guide navigation shows loading feedback until navigation finishes.
- [C10] At 375px, all controls fit and have targets of at least 44px.
- [C11] At 768px, wizard and guide have no horizontal overflow.
- [C12] Light and dark modes retain readable text, focus, and selected states.
- [C13] Keyboard users can select, submit, return, and read associated errors.
- [C14] Server HTML includes manager choices and personalized guide instructions.

## Design

Use existing warm stone surfaces, rare rose actions, mono controls, and rounded-lg borders.
Keep a compact reading width and a visible two-step sequence.
Each step asks one question and provides one next action.

## Scope

No package publishing, accounts, package lookup service, or new guide content series.
The guide remains one canonical article for packages in the npm ecosystem.
