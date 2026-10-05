---
title: 'Codex skills: run curated Agent Skills in Codex CLI'
description: "Find curated Codex Skills with readable sources. Learn where Skills load, how to run or install them, and how to check your own Skill across Agents."
heading: Codex skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-10-05
---

Codex is OpenAI's coding Agent for the terminal and the editor. It reads Agent Skills from a directory in your project or your home directory. skilld gives you a curated set of those Skills, each written by a person in their own repository, and one command that puts a Skill in front of Codex.

## How Skills work in Codex

Codex loads a Skill from a `SKILL.md` file. Each Skill sits in its own directory.

- Project: `.agents/skills/<skill>/SKILL.md`
- Global: `~/.agents/skills/<skill>/SKILL.md`

Amp and Zed read the same two directories. One install serves all three Agents.

Codex discovers Skills at startup. It keeps each name and description in context. When a task matches a description, Codex loads the full file and follows it.

To write your own, follow [Write a Skill that works across Agents](/learn/create-agent-skills).
Start with a complete `SKILL.md`, then check discovery and task completion in Codex.

### Install a Skill for Codex

```sh
npx skilld install owner/repo/skill --agent codex
```

The Skill lands in `.agents/skills`. Add `--global` to install to `~/.agents/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Start a new Codex session after an install. Codex reads the directory at startup.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Codex. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

## Codex CLI Skills

The Codex CLI and the Codex editor extension share the `.agents/skills` directory in a project. A Skill you install once works in both.

Several lists on [GitHub](https://github.com) call themselves awesome Codex skills. They collect links. The registry admits fewer Skills, names the author of each, and links the exact source file. Read the file, then decide.
