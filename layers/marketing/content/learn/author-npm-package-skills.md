---
title: Author a Skill for your npm package
description: Draft a Skill from your public API, include it in your npm package, and check the tarball before publishing.
relatedPages:
  - path: /make-skill?kind=package
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-05-13
updatedAt: 2026-09-07
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="npm"}
::

Point your agent at the directory containing your package's `package.json`.
For a monorepo, use the individual package directory.
Ask it to save the draft in `skills/your-skill/SKILL.md`.

Describe the tasks your package handles and the mistakes agents should avoid.
Check public exports, TypeScript types, supported runtimes, and version limits.
Use current examples from your own documentation.

## 2. Review the draft

Run each example against the package version you plan to release.
Remove generic advice and unsupported claims.
Keep detailed material in `references/` and link it from `SKILL.md`.
Use the [authoring Skill's quality checks](https://github.com/skilld-dev/skilld/tree/main/skills/generate-package-skill) before committing.

## 3. Include the Skill in your package

If `package.json` has a `files` list, add `skills` to the existing entries.
Keep the entries for your built code and other release files.
Check `.npmignore` rules that could exclude the Skill or its references.
The [npm package.json reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) explains file inclusion.

From the package directory, inspect the release file list:

```bash
npm pack --dry-run
```

Confirm it includes `skills/your-skill/SKILL.md` and every linked local file.
This command checks the [npm](https://npmjs.com) tarball, regardless of which package manager you use for development.
See the [npm pack reference](https://docs.npmjs.com/cli/v11/commands/npm-pack).

## 4. Publish and share

Commit the reviewed Skill and publish through your normal release process.
Link to its repository directory from your package README.
Installing the npm package does not automatically install the Skill into an agent.
Keep the Skill link visible so developers can choose how to use it.

When your API changes, review the Skill alongside your package documentation.
