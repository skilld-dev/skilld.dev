---
title: 'Claude Code skills: run curated Agent Skills in Claude Code'
description: "Find curated Claude Code Skills with readable sources. Learn where Skills load, how to run or install them, and how to check your own Skill across Agents."
heading: Claude Code skills
label: Agents
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-10-05
---

Claude Code reads Skills from `.claude/skills`. It supports the shared Agent Skills format.
Check discovery paths and execution requirements before using the same Skill in another Agent.
skilld gives you a curated set of those Skills, each written by a person in their own repository, and one command that puts a Skill in front of Claude Code.

## What are Claude Code Skills

A Skill is a directory with a `SKILL.md` file. The file starts with a name and a description, then holds instructions in Markdown. A Skill can carry supporting files: scripts, references, templates.

Claude Code reads each description at the start of a session. When your request matches, it loads the full file and follows it. You can also call a Skill by name with `/<skill>`{lang="html"}.

A Skill differs from `CLAUDE.md`. `CLAUDE.md` loads at the start of a session.
A Skill's body loads when invoked, then remains in the conversation.
See [Claude Code's Skill lifecycle](https://code.claude.com/docs/en/skills#skill-content-lifecycle).

To write your own, follow [Create a Claude Code Skill](/learn/create-agent-skills).
The complete example includes discovery paths and task checks for Codex and Gemini CLI too.

## How to add Skills to Claude Code

- Project: `.claude/skills/<skill>/SKILL.md`. Commit it, and every teammate gets it.
- Global: `~/.claude/skills/<skill>/SKILL.md`, for every project. If `CLAUDE_CONFIG_DIR` is set, Claude Code and skilld both use `$CLAUDE_CONFIG_DIR/skills`.

### Install a Skill for Claude Code

```sh
npx skilld install owner/repo/skill --agent claude-code
```

The Skill lands in `.claude/skills`. Add `--global` to install to `~/.claude/skills` instead. skilld detects the Agents in your project and on your machine. If it finds only one, omit `--agent`.

Start a new Claude Code session after an install. Skills load at startup.

### Run a Skill without installing it

```sh
npx skilld run owner/repo/skill
```

`skilld run` prints the Skill and writes no file. Give the command to Claude Code. It reads the Skill and follows it for this session. Nothing lands in your repository, and no lockfile changes.
