---
title: How to ship an agent skill with your npm package
description: Generate a SKILL.md from your package's docs, issues, and changelog, then publish it so every agent picks it up on install.
relatedPages:
  - path: /skills/guide
    title: Skills guide
  - path: /skills/official
    title: Official package skills
createdAt: 2026-05-13
updatedAt: 2026-05-13
---

If you maintain an [npm](https://npmjs.com) package, your README is already drifting from your code. Agents that pull "latest docs" from a generic indexer get a snapshot of yesterday plus whatever stale Stack Overflow answer ranked well. The fix is to ship a SKILL.md with the package itself, versioned alongside the code, so the agent reads what you published.

This guide walks through `skilld author package`: what it reads, what it writes, and how consumers pick it up. The output follows the [Agent Skills specification](https://agentskills.io/home) and is compatible with [antfu's skills-npm convention](https://github.com/antfu/skills-npm), so consumers using either toolchain see the same files.

## What `skilld author` does

`skilld author package` runs inside your package directory and produces a `skills/<name>/SKILL.md` file. It pulls from local docs, your changelog, and [GitHub](https://github.com) issues and discussions, then asks an LLM to compress that into a tight SKILL.md with the triggering frontmatter agents need.

The command then patches `package.json` so `"skills"` lands in the `files` array. Anyone who installs your package can run `skilld prepare` and the skill drops into their agent config.

```bash
cd path/to/your-package
npx skilld author package
```

That's the whole authoring loop for a single package. For a monorepo, run the same command from the root and pick which packages should ship skills.

## What the command reads, in order

The cascade is deterministic. Skilld walks it once, stops at the first hit, and caches the result:

1. **`docs/` in the package directory.** All `.md` and `.mdx` files, walked recursively.
2. **`docs/` or `docs/content/` at the monorepo root.** [Nuxt Content](https://content.nuxt.com) conventions are recognized.
3. **[`llms.txt`](https://llmstxt.org/)** in the package, then the monorepo root.
4. **`README.md`** (any case) in the package, then the monorepo root.
5. **`CHANGELOG.md`** is always cached separately if present.

If you have rich documentation, write it once in `docs/` and let skilld pull from there. If you only have a README, that's fine; the output will be terser.

When the GitHub CLI (`gh`) is installed and authenticated, skilld also fetches the most recent 30 issues and 20 discussions for the repo. They land in the cache as searchable references; the LLM uses them to surface gotchas users hit.

## What the LLM produces

After the cache fills, skilld asks an LLM to write specific sections. You pick which ones in the prompt:

- **API changes.** New, renamed, and deprecated APIs from the version history. Adapts its item budget to how busy your changelog is.
- **Best practices.** Gotchas, pitfalls, and patterns mined from issues, discussions, and docs.
- **Custom section.** You supply a heading and instructions. Useful for migration notes ("Migrating from v2 to v3") or framework-specific patterns ("SSR setup").

You can also pick **Prompt only**, which writes the prompts into `.skilld/` without calling the LLM. Run them in whatever model you prefer, paste the output back. Useful in CI where you don't want to spend tokens on every build.

Pick a model on first run; skilld remembers it. Subsequent runs use the same model unless you pass `-m`.

## The output, anatomized

The generated SKILL.md has three parts: frontmatter, a references block, and the LLM-written body.

The frontmatter is doing more work than it looks like. The `description` field is what agents match against when deciding whether to load your skill. Skilld builds it from your package description plus keyword variants:

- `@nuxt/ui` produces matches for `@nuxt/ui`, `nuxt/ui`, and `nuxt ui`
- `vue-router` produces matches for `vue-router` and `vue router`
- A repo name like `motion-v` produces `motion-v` and `motion v`

The description always includes the phrase `ALWAYS use when editing ... or code importing "<package>"`. Agents see that, prioritize accordingly, and load the skill in the right contexts without you wiring anything up.

The references block is a markdown link list pointing at the original sources: `package.json`, README, docs index, issues, discussions, releases. When the skill is installed in a consumer's project, those links resolve to local files under `references/`. Agents can crack them open when they need more than the summary.

## Monorepo mode

If your repo is a workspaces or [pnpm](https://pnpm.io) monorepo, skilld detects it and offers a multiselect. Pick the packages that should ship skills:

```bash
cd path/to/your-monorepo
npx skilld author package
# ◆ Which packages should ship skills?
# ◻ @scope/core
# ◻ @scope/utils
# ◻ @scope/cli
```

Each selected package gets its own `skills/<name>/` directory and its own `package.json` patch. The LLM config (model, sections) is resolved once and reused across the batch.

Packages without their own repo URL inherit the repo URL from the monorepo root, so issue and discussion fetching works for every package in the workspace.

## Flags worth knowing

| Flag | What it does |
|---|---|
| `-y` | Skip prompts. Uses the configured or recommended model and the default sections (api-changes, best-practices). |
| `-m <id>`{lang="html"} | Force a specific enhancement model for this run. |
| `-o <dir>`{lang="html"} | Write the skill somewhere other than `./skills/<name>/`. Must be a child of the package directory. |
| `-f` | Clear the reference cache and refetch everything. Use after major doc rewrites. |
| `--debug` | Save raw LLM output under `logs/`. Useful for tuning prompts. |

`-o` is the only one with a sharp edge worth flagging: if you write outside `skills/`, the `package.json` patch is skipped. Add the path to `files` manually if you want it published.

## What consumers see

Once you publish, anyone who depends on your package can pull the skill with one command:

```bash
npm install your-package
npx skilld prepare
```

Or wire it into their own `package.json` so it runs on every install:

```json
{
  "scripts": {
    "prepare": "skilld prepare"
  }
}
```

`skilld prepare` walks the consumer's `node_modules`, finds every package shipping a `skills/` directory, and links them into the agent config. No registry lookup, no network call. The skill is files in `node_modules`, the way the rest of the JavaScript ecosystem works.

Consumers who already use [`skills-npm`](https://github.com/antfu/skills-npm) get the same result. Skilld auto-detects skills-npm packages and uses them when available, so you can author with skilld and ship to either ecosystem without a second pipeline.

## When to regenerate

Author once, then regenerate on the same cadence you cut releases. The cache is keyed on package name and version, so a fresh release with a new changelog entry will pick up new content automatically. For local iteration, pass `-f` to force a refetch.

A common pattern is a release script that runs `skilld author package -y` after the version bump and before `npm publish`. The skill ships with the tarball, the consumer's `skilld prepare` finds it, and the agent has accurate docs for the exact version installed.

## What skilld does not do

It does not write your README. If your docs are thin, the skill will be thin. The LLM compresses what's there; it does not invent capabilities.

It does not hide behind a service. Skills are markdown files in your repo. You can read them, edit them, commit them, and revert them like any other source file. The LLM is a code-gen step, not a runtime dependency.

If you want to see what a finished skill looks like before authoring one yourself, the [official providers](/skills/official) page lists packages skilld maintains skills for directly.

## Related

- [Agent Skills specification](https://agentskills.io/home)
- [antfu/skills-npm](https://github.com/antfu/skills-npm) — convention for shipping skills in npm packages
- [Claude Code skill best practices](https://code.claude.com/docs/en/skills#add-supporting-files) — keep SKILL.md under 500 lines, push detail into references
- [skilld on GitHub](https://github.com/skilld-dev/skilld)
