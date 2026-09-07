---
title: Author an agent skill for your npm package
description: Run the skilld-maintained generate-package-skill Skill to draft a SKILL.md, then edit, commit, and own it in your repository.
relatedPages:
  - path: /skills/best
    title: Skills worth installing
  - path: /skills
    title: Browse skills
createdAt: 2026-05-13
updatedAt: 2026-09-07
---

**TL;DR.** The skilld CLI never writes a skill. The skilld project maintains a visible Skill named `generate-package-skill`. Run it with `skilld run`, and your agent drafts a SKILL.md for the package you maintain. You edit the draft, commit it to your repository, and skilld lists it with your name.

This guide is for package maintainers who want a useful first pass without starting from an empty file. The Skill does not publish anything, claim authorship, or place the file in a skilld-owned registry. [GitHub](https://github.com) remains the source of record.

## Run the authoring Skill

::package-skill-setup
::

`skilld run` prints the Skill and installs nothing. Your agent reads the instructions and follows them. Nothing lands in your repository until the agent writes the draft, and you review every file before you commit.

The Skill source is public. Read [generate-package-skill on GitHub](https://github.com/skilld-dev/skilld/tree/main/skills/generate-package-skill) before you run it.

## What the Skill asks your agent to do

The instructions tell the agent to research before it writes:

1. Record the exact installed package version.
2. Read the package manifest and every exported entry point.
3. Read public type entry points and their source definitions.
4. Read current official documentation and runnable examples.
5. Check release notes and migration guides for the exact version.
6. Prefer public exports over internal files.
7. Record advice only when the source or official documentation proves it.

The agent writes one directory named after the Skill. The directory contains `SKILL.md`, with detailed material in `references/` and reusable commands in `scripts/` when execution adds value.

## What the draft contains

A starting draft can include:

- Version-specific API rules with a source path or documentation URL for each one.
- Small examples for common tasks.
- Environment and version limits.
- Links back to the source documentation.

The output stays a draft until you edit and approve it. The Skill tells the agent to show the generated files for review and to replace an existing Skill only after you approve.

## Review before you commit

Check the draft as package source code:

1. Verify every command and code example against the current release.
2. Remove generic advice that does not reflect your package.
3. Add constraints, failure modes, and tradeoffs that only a maintainer would know.
4. Keep the trigger description precise enough for agents to load the skill at the right time.
5. Follow every reference link and remove stale material.
6. Read the final diff, then commit it under your own name.

The committed SKILL.md should reflect your judgment. If you would not sign off on a paragraph in your package documentation, do not ship it in the skill.

## Monorepos

Run the Skill once per package that needs a draft. Point the agent at the package directory each time, so each package receives its own `skills/<name>/` directory. Packages without a repository URL can reference the root repository URL for source links.

## Commit to your repository

Once the draft has passed maintainer review:

1. Commit the SKILL.md to the package repository.
2. Include the `skills` directory in the [npm](https://npmjs.com) tarball when package distribution is useful.
3. Publish the package or repository through your normal release process.
4. Check the source link and run command after release.

Skilld can discover and link to the file after you publish it. The file remains yours. Your repository carries its history, issues, ownership, and removal path.

## What consumers run

Once skilld lists the skill, a developer gives their agent one command:

```bash
npx skilld@beta run skilld:owner/repository/skill
```

The agent reads the skill for the current session and writes nothing. A developer who wants the skill in every session swaps `run` for `install`, and the files land in their repository as plain files.

The same layout works with [skills-npm](https://github.com/antfu/skills-npm), so maintainers can support either path from the files they own.

## Keep it current

Review the skill when the package changes. Run the Skill again to draft an update, then inspect and approve the diff before you commit. Version history remains useful only when the published guidance matches the code.

## Related

- [Agent Skills specification](https://agentskills.io/home)
- [skills-npm](https://github.com/antfu/skills-npm)
- [Claude Code skill best practices](https://code.claude.com/docs/en/skills#add-supporting-files)
- [skilld on GitHub](https://github.com/skilld-dev/skilld)
