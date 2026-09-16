---
title: Author a Skill for your project
description: Draft a Skill from your repository's commands, conventions, and workflows. Review it, then keep it in the repository so any agent can run it.
publishedAt: 2026-09-08
updatedAt: 2026-09-08
---

## 1. Draft your Skill

::project-skill-setup
::

Point your agent at the repository root.
Ask it to save the draft in `skills/your-skill/SKILL.md`.

Describe the work the Skill covers: the commands to run, the files to read first, and the rules agents break most often.
Point to source files instead of copying them.
Name the directories an agent must not edit.

## 2. Review the draft

Run each command the Skill lists and check the outcome it records.
Remove generic advice and rules the repository does not enforce.
Keep detailed material in `references/` and link it from `SKILL.md`.
Use the [authoring Skill's quality checks](https://github.com/skilld-dev/skilld/tree/main/skills/generate-project-skill) before committing.

## 3. Keep the Skill in the repository

Commit the reviewed Skill.
[GitHub](https://github.com) is the source of truth, and skilld.dev reads the Skill from one exact commit.
Any dev with access to the repository can run it:

```bash
npx skilld run skilld:owner/repo/your-skill
```

Replace `owner/repo` with your repository and `your-skill` with the Skill directory name.
Put the command in your README so contributors can find it.
For a private repository, see [Use Skills from private Repositories](/learn/private-repositories).

## 4. Keep it current

When a command or convention changes, review the Skill alongside the change.
Run the authoring Skill again when the project structure moves.
