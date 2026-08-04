---
title: Bootstrap an agent skill for your npm package
description: Start a SKILL.md draft from package docs, then edit, own, and publish it in your repository.
relatedPages:
  - path: /skills/guide
    title: Skills guide
  - path: /skills
    title: Browse skills
createdAt: 2026-05-13
updatedAt: 2026-08-04
---

**TL;DR.** `skilld author package` creates a starting draft from your package documentation. You review the draft, rewrite it where needed, and publish it from your own repository. Skilld provides the authoring aid. You edit and own the published skill.

The command is for package maintainers who want a useful first pass without starting from an empty file. It does not publish a skill, claim authorship, or place the file in a skilld-owned registry. GitHub remains the source of record.

## Start the draft

Run the command inside the package you maintain:

```bash
cd path/to/your-package
npx skilld author package
```

The command reads package material and writes a draft to `skills/<name>/SKILL.md`. It can also add the `skills` directory to the package `files` list.

The draft is a working document. Read every section before committing it. Remove claims you cannot support, add the judgment your users need, and make sure the instructions match the current release.

## What the command reads

The source cascade is deterministic:

1. `docs/` in the package directory, including Markdown and MDX files.
2. `docs/` or `docs/content/` at the monorepo root.
3. `llms.txt` in the package, then the monorepo root.
4. `README.md` in the package, then the monorepo root.
5. `CHANGELOG.md`, cached separately when present.

With an authenticated GitHub CLI, the command can also collect recent issues and discussions as reference material. Those sources help expose recurring problems. They do not replace maintainer review.

## What the draft contains

The starting draft can include:

- API changes drawn from version history.
- Practices and common problems drawn from documentation and issues.
- A custom section defined by your prompt.
- Links back to the source documentation.

You can choose prompt-only mode to write prompts under `.skilld/` without calling a model. In either mode, the output remains a draft until you edit and approve it.

## Review before publishing

Check the draft as package source code:

1. Verify every command and code example against the current release.
2. Remove generic advice that does not reflect your package.
3. Add constraints, failure modes, and tradeoffs that only a maintainer would know.
4. Keep the trigger description precise enough for agents to load the skill at the right time.
5. Follow every reference link and remove stale material.
6. Read the final diff, then commit it under your own name.

The published SKILL.md should reflect your judgment. If you would not sign off on a paragraph in your package documentation, do not ship it in the skill.

## Monorepos

From a workspace root, select the packages that need drafts:

```bash
cd path/to/your-monorepo
npx skilld author package
# ◆ Which packages need a skill draft?
# ◻ @scope/core
# ◻ @scope/utils
# ◻ @scope/cli
```

Each selected package receives its own `skills/<name>/` directory. Packages without a repository URL can inherit the root repository URL for reference collection.

## Flags

| Flag | What it does |
|---|---|
| `-y` | Skip prompts and use the configured draft settings. |
| `-m <id>`{lang="html"} | Select the model used for this draft. |
| `-o <dir>`{lang="html"} | Write the draft to a child directory of the package. |
| `-f` | Clear cached references and fetch them again. |
| `--debug` | Save raw model output under `logs/` for inspection. |

Writing outside `skills/` with `-o` skips the package manifest change. Add the chosen path to `files` yourself if it belongs in the npm tarball.

## Publish from your repository

Once the draft has passed maintainer review:

1. Commit the SKILL.md to the package repository.
2. Include the `skills` directory in the npm tarball when package distribution is useful.
3. Publish the package or repository through your normal release process.
4. Check the source link and install command after release.

Skilld can discover and link to the file after you publish it. The file remains yours. Your repository carries its history, issues, ownership, and removal path.

## What consumers run

For a skill shipped with an npm package:

```bash
npm install your-package
npx skilld prepare
```

`skilld prepare` finds package skills and links them into supported agent directories. The skill remains an ordinary file under `node_modules`.

The same layout works with [skills-npm](https://github.com/antfu/skills-npm), so maintainers can support either installer from the files they own.

## Keep it current

Review the skill when the package changes. Release automation may produce another draft, but a maintainer should inspect and approve the diff before publication. Version history remains useful only when the published guidance matches the code.

## Related

- [Agent Skills specification](https://agentskills.io/home)
- [skills-npm](https://github.com/antfu/skills-npm)
- [Claude Code skill best practices](https://code.claude.com/docs/en/skills#add-supporting-files)
- [skilld on GitHub](https://github.com/skilld-dev/skilld)
