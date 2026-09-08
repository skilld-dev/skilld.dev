---
title: Author a Skill for your Rust crate
description: Draft a Skill for your crate, include its files, and check the package with Cargo before publishing to crates.io.
relatedPages:
  - path: /make-skill?kind=package
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-09-07
updatedAt: 2026-09-07
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="crates"}
::

Point your agent at the crate directory containing `Cargo.toml`.
For a workspace, use the member crate you maintain.
Ask it to save the draft in `skills/your-skill/SKILL.md`.

Cover public exports, feature flags, error handling, and supported Rust versions.
State which features each example needs.
Explain ownership or lifetime constraints where they affect real usage.

## 2. Review the draft

Compile the examples with their stated features.
Check that they use public APIs from the release you plan to publish.
Remove generic Rust advice and cite your crate documentation for specific rules.
Review the draft before committing it.

## 3. Include and check the Skill

Check `include` and `exclude` under `[package]` in `Cargo.toml`.
If you use an inclusion list, add `skills/**` beside the existing release paths.
Keep every file referenced by `SKILL.md`.
See Cargo's [include and exclude rules](https://doc.rust-lang.org/cargo/reference/manifest.html#the-include-and-exclude-fields).

From the crate directory, list the archive contents:

```bash
cargo package --list
```

Confirm the list includes your Skill and its references.
Then run the publishing checks without uploading:

```bash
cargo publish --dry-run
```

See the [Cargo package](https://doc.rust-lang.org/cargo/commands/cargo-package.html) and [Cargo publish](https://doc.rust-lang.org/cargo/commands/cargo-publish.html) references.

## 4. Publish and share

Commit the reviewed Skill and publish through your normal crates.io release process.
Link to its repository directory from the crate README.
Adding the crate as a dependency does not automatically install the Skill into an agent.
Review the Skill when public APIs, default features, or compiler requirements change.
