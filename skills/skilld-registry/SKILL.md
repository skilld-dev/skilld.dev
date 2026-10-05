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

## Fork a Skill

If the user says `fork this Skill <skilld.dev URL>`, follow its `Fork this Skill` link.
The link requests only the fork workflow with `?action=fork`.
Without that link, fetch the page with `Accept: text/markdown` and add `?action=fork`.
Follow its fork workflow before the borrowed Skill instructions.
If Markdown negotiation is unavailable, fetch the page's `.md?action=fork` URL.

Use `get_skill` for the source URL, source commit, Skill path, and licence.
Copy the complete source directory at one commit, then install that local path.
Preserve author credit, licence files, scripts, binary assets, and executable modes.
Never save the page wrapper as SKILL.md or install the upstream selector for a fork.
Never overwrite existing files or publish the local copy without the user's request.

## Fallback

When MCP is unavailable, search `https://skilld.dev/skills` and inspect the linked GitHub source before suggesting a run.
