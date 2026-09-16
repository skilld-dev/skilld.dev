---
title: 'Windsurf skills: run curated Agent Skills in Windsurf'
description: "How to use Skills in Windsurf: where Windsurf reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: Windsurf skills
label: Agents
command: npx skilld run skilld:owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Windsurf reads Agent Skills from `.windsurf/skills` in a project and from `~/.codeium/windsurf/skills` for every project. Windsurf also has Rules and Workflows. A Skill is the portable one: the same directory works in the other Agents skilld targets. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of Windsurf.

## How Skills work in Windsurf

- Project: `.windsurf/skills/<skill>/SKILL.md`
- Global: `~/.codeium/windsurf/skills/<skill>/SKILL.md`

Windsurf reads each Skill description and loads the full file when a task matches.

### Install a Skill for Windsurf

```sh
npx skilld install skilld:owner/repo/skill --agent windsurf
```

The Skill lands in `.windsurf/skills`. Add `--global` to install to `~/.codeium/windsurf/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Restart Windsurf after an install.

### Run a Skill without installing it

```sh
npx skilld run skilld:owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to the Windsurf Agent. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

