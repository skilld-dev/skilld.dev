---
title: 'Cursor skills: run curated Agent Skills in Cursor'
description: "How to use Skills in Cursor: where Cursor reads them, how they differ from Rules, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: Cursor skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Cursor reads Agent Skills from `.cursor/skills`, next to the Rules you may already keep in `.cursor/rules`. A Skill is a `SKILL.md` file with instructions the Agent loads when a task calls for it. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of Cursor.

## How Skills work in Cursor

- Project: `.cursor/skills/<skill>/SKILL.md`
- Global: `~/.cursor/skills/<skill>/SKILL.md`

Cursor lists the Skills it found under Settings, then Rules. The Agent loads a Skill when your request matches the Skill description.

### Install a Skill for Cursor

```sh
npx skilld install owner/repo/skill --agent cursor
```

The Skill lands in `.cursor/skills`. Add `--global` to install to `~/.cursor/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Restart Cursor after an install. The Skill then appears in Settings.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to the Cursor Agent. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

## Rules vs Skills

A Rule is always on, or attaches to files that match a glob. Cursor puts the whole Rule in context on every matching request.

A Skill loads on demand. Cursor keeps only the name and description in context. When a task matches, it reads the full `SKILL.md` and any supporting files.

- Use a Rule for a short standing instruction: a naming convention, a banned import.
- Use a Skill for a procedure with steps, examples, or reference files: a release checklist, a testing approach for one library.

Skills are portable. The same directory works in Claude Code, Codex, and the other Agents skilld targets. A `.mdc` Rule works in Cursor only.
