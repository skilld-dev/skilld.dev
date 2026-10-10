---
title: Author a Skill for your npm package
description: Draft a Skill from your public API, include it in your npm package, and check the tarball before publishing.
relatedPages:
  - path: /make-skill?kind=package
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-05-13
updatedAt: 2026-10-10
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="npm"}
::

Point your agent at the directory containing your package's `package.json`.
For a monorepo, use the individual package directory.
Ask it to save the draft in `skills/your-skill/SKILL.md`.
Keep `skills/` beside that package's `package.json`.
[pnpm 12.11 and newer](https://pnpm.io/agent-skills) discover Skills one level deep at `skills/<name>/SKILL.md`.

Describe the tasks your package handles and the mistakes agents should avoid.
Check public exports, TypeScript types, supported runtimes, and version limits.
Use current examples from your own documentation.

## 2. Review the draft

Run each example against the package version you plan to release.
Use [the cross-Agent selection and task checks](/learn/create-agent-skills#check-selection-and-task-completion-separately) before publishing the Skill.
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
Keep the Skill link visible so developers can choose how to use it.

Developers using pnpm 12.11 or newer can approve Skills from direct dependencies with `pnpm approve`.
pnpm records the choice in `pnpm-workspace.yaml`:

```yaml
permissions:
  your-package:
    skills: true
```

Replace `your-package` with the published package name, including its scope.
Merge this entry into existing permissions.
Approval covers every Skill in the package and every later version.
Ask developers to read the Skills before approving.

pnpm links approved Skills into existing Agent directories at the workspace root.
Developers can choose directories with `skills.dirs` in `pnpm-workspace.yaml`:

```yaml
skills:
  dirs:
    - .agents/skills
```

Merge this setting into the existing workspace file, then run `pnpm install`.
For `your-package`, the example Skill appears at `.agents/skills/pnpm-your-package-your-skill/SKILL.md`.
A scoped package replaces `/` with `+` in the link name.
pnpm owns these links and removes them when the package or approval disappears.
Global installs, `pnpm dlx`, and `pnpm deploy` do not link Skills.
See [pnpm's approval and linking rules](https://pnpm.io/agent-skills).

When your API changes, review the Skill alongside your package documentation.
