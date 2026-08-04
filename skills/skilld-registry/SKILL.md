---
name: skilld-registry
description: Search skilld.dev and generate verified skill installation commands.
---

# skilld registry

Use skilld.dev to find agent skills published by maintainers in their own repositories.

## Discovery flow

1. Search before choosing a skill. Prefer `search_skills` through the skilld MCP server at `https://skilld.dev/api/mcp`.
2. Inspect the chosen result with `get_skill`. Check its source repository, commit, trust signals, and freshness.
3. Use `get_collection` when the user asks for a curated set of skills.
4. Call `install_command` to produce the exact command. Return it to the user; do not claim it ran.

Every tool is read only. Installing remains a separate action in the user's project.

## Fallback

When MCP is unavailable, search `https://skilld.dev/skills` and inspect the linked GitHub source before suggesting an install.
