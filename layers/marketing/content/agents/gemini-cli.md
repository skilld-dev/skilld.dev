---
title: 'Gemini CLI skills: run curated Agent Skills in Gemini CLI'
description: "How to use Skills in Gemini CLI: where Gemini CLI reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: Gemini CLI skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Gemini CLI is Google's coding Agent for the terminal. It reads Agent Skills from `.gemini/skills` in a project and from `~/.gemini/skills` for every project. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of Gemini CLI.

## How Skills work in Gemini CLI

- Project: `.gemini/skills/<skill>/SKILL.md`
- Global: `~/.gemini/skills/<skill>/SKILL.md`

Gemini CLI reads each Skill description at startup and loads the full file when a task matches.

### Install a Skill for Gemini CLI

```sh
npx skilld install owner/repo/skill --agent gemini-cli
```

The Skill lands in `.gemini/skills`. Add `--global` to install to `~/.gemini/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Start a new Gemini CLI session after an install. Run `/skills list` to see what it found.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Gemini CLI. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

