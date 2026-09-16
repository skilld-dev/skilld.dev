---
title: 'OpenClaw skills: run curated Agent Skills in OpenClaw'
description: "How to use Skills in OpenClaw: where OpenClaw reads them, how skilld installs them, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: OpenClaw skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

OpenClaw is a personal assistant Agent that runs on your own machine and talks to you over your messaging apps. It reads Skills from a `skills` directory in its workspace and from `~/.openclaw/skills`. A Skill can tell OpenClaw to run scripts and call outside services, so read a Skill before you run it. skilld shows you the author and the exact source file first.

## How Skills work in OpenClaw

- Workspace: `skills/<skill>/SKILL.md`. The directory sits at the root of the OpenClaw workspace, not under a dot folder.
- Global: `~/.openclaw/skills/<skill>/SKILL.md`

OpenClaw reads each Skill description and loads the full file when a task matches.

### Install a Skill for OpenClaw

Run the command from the root of your OpenClaw workspace.

```sh
npx skilld install owner/repo/skill --agent openclaw
```

The Skill lands in `skills`. Add `--global` to install to `~/.openclaw/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to OpenClaw. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

## Before you install an OpenClaw Skill

skilld checks where a Skill came from and that the bytes match that source. It does not check what the Skill asks OpenClaw to do. Open the source file. If a Skill runs a script, read the script.
