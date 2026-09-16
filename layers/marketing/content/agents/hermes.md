---
title: 'Hermes skills: run curated Agent Skills in Hermes Agent'
description: "How to use Skills in Hermes Agent: where Hermes reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: Hermes Agent skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Hermes Agent is the Agent from Nous Research. It reads Skills from `.hermes/skills` in a project and from `~/.hermes/skills` for every project. skilld gives you a curated set of Skills, each written by a person in their own repository, and one command that puts a Skill in front of Hermes.

## How Skills work in Hermes Agent

- Project: `.hermes/skills/<skill>/SKILL.md`
- Global: `~/.hermes/skills/<skill>/SKILL.md`

Hermes reads each Skill description and loads the full file when a task matches.

### Install a Skill for Hermes Agent

```sh
npx skilld install owner/repo/skill --agent hermes
```

The Skill lands in `.hermes/skills`. Add `--global` to install to `~/.hermes/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Hermes. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

## Hermes Agent skills and the other Agents

A Hermes Skill is a plain `SKILL.md` directory. Install the same Skill for Claude Code or Codex with a different `--agent` value. Repeat `--agent` to write it for several Agents in one command.
