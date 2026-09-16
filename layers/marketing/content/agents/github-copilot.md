---
title: 'GitHub Copilot skills: run curated Agent Skills in Copilot'
description: "How to use Skills in GitHub Copilot: where Copilot reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: GitHub Copilot skills
label: Agents
command: npx skilld run skilld:owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

GitHub Copilot reads Agent Skills from `.github/skills`. The Copilot coding agent on github.com, the Copilot CLI, and Copilot in your editor use that directory, so a Skill you commit once follows the repository. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of Copilot.

## How Skills work in GitHub Copilot

- Project: `.github/skills/<skill>/SKILL.md`
- Global: `~/.copilot/skills/<skill>/SKILL.md`

Copilot reads each Skill description at startup and loads the full file when a task matches.

### Install a Skill for GitHub Copilot

```sh
npx skilld install skilld:owner/repo/skill --agent github-copilot
```

The Skill lands in `.github/skills`. Add `--global` to install to `~/.copilot/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Restart your editor after a project install. Copilot reads `.github/skills` at startup.

### Run a Skill without installing it

```sh
npx skilld run skilld:owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Copilot. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

