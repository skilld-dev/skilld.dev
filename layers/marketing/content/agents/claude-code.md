---
title: 'Claude Code skills: run curated Agent Skills in Claude Code'
description: "How to use Skills in Claude Code: what a Skill is, where Claude Code reads it, how to add one, and a curated list with authors. The same Skill runs in Claude Code, Codex, Cursor, and every other Agent skilld targets."
heading: Claude Code skills
label: Agents
command: npx skilld@beta run skilld:owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Claude Code reads Skills from `.claude/skills`. The format is the Agent Skills specification, so a Skill written for Claude Code also runs in Codex, Cursor, and the other Agents skilld targets. skilld gives you a curated set of those Skills, each written by a person in their own repository, and one command that puts a Skill in front of Claude Code.

## What are Claude Code Skills

A Skill is a directory with a `SKILL.md` file. The file starts with a name and a description, then holds instructions in Markdown. A Skill can carry supporting files: scripts, references, templates.

Claude Code reads each description at the start of a session. When your request matches, it loads the full file and follows it. You can also call a Skill by name with `/<skill>`{lang="html"}.

A Skill differs from `CLAUDE.md`. `CLAUDE.md` is always in context. A Skill loads only when needed, so it can be long without a cost on every turn.

## How to add Skills to Claude Code

- Project: `.claude/skills/<skill>/SKILL.md`. Commit it, and every teammate gets it.
- Global: `~/.claude/skills/<skill>/SKILL.md`, for every project. If `CLAUDE_CONFIG_DIR` is set, Claude Code and skilld both use `$CLAUDE_CONFIG_DIR/skills`.

### Install a Skill for Claude Code

```sh
npx skilld@beta install skilld:owner/repo/skill --agent claude-code
```

The Skill lands in `.claude/skills`. Add `--global` to install to `~/.claude/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Start a new Claude Code session after an install. Skills load at startup.

### Run a Skill without installing it

```sh
npx skilld@beta run skilld:owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Claude Code. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.

