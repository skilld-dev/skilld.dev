---
title: 'OpenCode skills: run curated Agent Skills in OpenCode'
description: "How to use Skills in OpenCode: where OpenCode reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: OpenCode skills
label: Agents
command: npx skilld@beta run skilld:owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

OpenCode is an open-source coding Agent for the terminal. It reads Agent Skills from `.opencode/skills` in a project and from `~/.config/opencode/skills` for every project. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of OpenCode.

## How Skills work in OpenCode

- Project: `.opencode/skills/<skill>/SKILL.md`
- Global: `~/.config/opencode/skills/<skill>/SKILL.md`. If `XDG_CONFIG_HOME` is set, OpenCode and skilld both use `$XDG_CONFIG_HOME/opencode/skills`.

OpenCode discovers Skills at startup and loads the full file when a task matches.

### Install a Skill for OpenCode

```sh
npx skilld@beta install skilld:owner/repo/skill --agent opencode
```

The Skill lands in `.opencode/skills`. Add `-g` to install to `~/.config/opencode/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Start a new OpenCode session after an install.

### Run a Skill without installing it

```sh
npx skilld@beta run skilld:owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to OpenCode. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

