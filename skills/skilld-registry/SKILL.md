---
name: skilld-registry
description: Search skilld.dev and return verified commands to run or install a skill.
---

# skilld registry

Use skilld.dev to find agent skills published by maintainers in their own repositories.

Running is the default. `skilld run` hands you the skill for this session and writes nothing to the user's project. Installing is the opt-in, for a skill the user wants in every session.

## Discovery flow

1. Search before choosing a skill. Prefer `search_skills` through the skilld MCP server at `https://skilld.dev/api/mcp`.
2. Inspect the chosen result with `get_skill`. Check its source repository, commit, trust signals, and freshness.
3. Use `get_collection` when the user asks for a curated set of skills.
4. Call `install_command` for the exact commands. Return them to the user; do not claim either one ran.

`search_skills` and `get_skill` return `runCommand` beside `installCommand`. Lead with `runCommand`. Offer `installCommand` only when the user asks to keep the skill.

`install_command` returns `runCommand` for a single-skill ref and `command` for the install. A collection, curator, repository, or npm ref has no run command yet, so `runCommand` is `null` there.

Every tool is read only. Running and installing both stay separate actions in the user's own environment.

## Fallback

When MCP is unavailable, search `https://skilld.dev/skills` and inspect the linked GitHub source before suggesting a run.
