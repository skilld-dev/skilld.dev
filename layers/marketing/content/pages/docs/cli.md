---
title: skilld CLI reference
description: Every skilld command with its help text, flags, and one example. Generated from the CLI help for skilld 3.0.0-beta.3.
label: Reference
author: Harlan Wilton
command: npm install --global skilld
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

Generated from `skilld --help` for skilld `3.0.0-beta.3`. Use `npx skilld <command>`{lang="html"} or install it once with `npm install --global skilld`.

The [npm](https://npmjs.com) package selects a native executable for your system. It has no JavaScript engine or fallback.

## Global flags

`skilld`: Search, run, install, and keep Skills current.

| Flag | Help |
|---|---|
| `--json` | Output stable JSON for Agents and automation. |
| `--plain` | Output stable text without terminal formatting. |

The two flags conflict. Pick one.

## skilld search

Search for Skills.

```sh
skilld search vue
```

Takes one or more words as the query.

## skilld run

Load a Skill for this session without installing it.

skilld run prints SKILL.md so the calling Agent follows it now. A remote run retains no Skill files. It creates no lockfile entry, Agent target, or project file.

skilld names the supporting files and prints none of them. Use `--file` to read one. Remote file reads also require the returned `--revision`. Use `skilld install` to put supporting files on disk.

| Argument or flag | Help |
|---|---|
| `SOURCE` | The Skill source to load. Same forms as `skilld install`. |
| `--file <PATH>`{lang="html"} | Read one supporting file the Skill carries. Repeat `--file` for several. Give the path exactly as the Skill inventory reports it. Remote reads require `--revision`. Local and bundled reads do not. skilld never prints executable or binary files. Install the Skill to use one. |
| `--revision <COMMIT>`{lang="html"} | Read supporting files from one exact remote Git commit. Use the revision that an earlier `skilld run` returned. |
| `--direct` | Fetch a public GitHub Repository without going through skilld.dev. Give a `github:` source or a [GitHub](https://github.com) tree URL. A direct run carries the `unverified` source status. |

```sh
npx skilld run skilld-dev/skills/find-skill
```

## skilld install

Install a Skill, or restore the Skills recorded in your lockfile.

Give `SOURCE` as one of:

| Source | Result |
|---|---|
| `OWNER/REPOSITORY/SKILL` | Install a hosted Artifact. |
| `github:OWNER/REPOSITORY/SKILL_PATH` | Install a hosted Artifact from an explicit GitHub selector. Add `--direct` to fetch the public Repository instead. |
| `github:OWNER/REPOSITORY/SKILL_PATH#branch:BRANCH` | Same, pinned to a branch. |
| `github:OWNER/REPOSITORY/SKILL_PATH#tag:TAG` | Same, pinned to a tag. |
| `github:OWNER/REPOSITORY/SKILL_PATH#commit:SHA` | Same, pinned to a commit. |
| `https://github.com/OWNER/REPOSITORY/tree/REF/SKILL_PATH` | Same, from a GitHub tree URL. |
| `./RELATIVE_PATH` or `ABSOLUTE_PATH` | Install a local Skill. |
| `skilld` | Install the skilld-maintained Skill with `--global`. |

Run `skilld install` without `SOURCE` to restore `.skills/skilld-lock.yaml`. Verified remote Skills restore the exact locked Git commit.

| Flag | Help |
|---|---|
| `--global` | Install to your account-level Agent targets. The default is the current project. |
| `--agent <AGENT>`{lang="html"} | Select an Agent target. Repeat `--agent` to select several. Values: `claude-code`, `cursor`, `windsurf`, `cline`, `codex`, `github-copilot`, `gemini-cli`, `goose`, `amp`, `opencode`, `roo`, `antigravity`. Default: every Agent target skilld detects. If skilld detects none, it uses `agent.targets`. |
| `--mode <MODE>`{lang="html"} | Choose how each Agent target receives the Skill. Values: `copy`, `symlink`. The default comes from `install.mode`. A fresh configuration sets `install.mode` to `copy`. |
| `--direct` | Fetch a public GitHub Repository without going through skilld.dev. Give an explicit `github:` source or a GitHub tree URL. Without `--direct`, these selectors use hosted Artifact delivery. A direct install records the `unverified` source status. |

```sh
skilld install skilld-dev/skills/find-skill --agent codex
```

## skilld list

List installed Skills.

| Flag | Help |
|---|---|
| `--global` | List the global scope. |

```sh
skilld list
```

## skilld view

View Skill details.

| Argument or flag | Help |
|---|---|
| `SKILL` | The installed Skill name. |
| `--global` | Look in the global scope. |

```sh
skilld view vue
```

## skilld remove

Remove an installed Skill.

| Argument or flag | Help |
|---|---|
| `SKILL` | The installed Skill name. |
| `--global` | Remove from the global scope. |

```sh
skilld remove vue
```

## skilld update

Update installed Skills.

| Argument or flag | Help |
|---|---|
| `SKILL` | One installed Skill. Omit it to update every Skill. |
| `--check` | Check update relations without changing files. |
| `--interactive` | Select Skill updates in a terminal. Conflicts with `SKILL`, `--check`, `--json`, and `--plain`. |
| `--global` | Update Skills in the global scope. |

```sh
skilld update --check --json
```

## skilld verify

Verify a Skill source.

| Argument | Help |
|---|---|
| `SKILL` | One installed Skill. Omit it to verify every Skill. |

```sh
skilld verify vue
```

See [How skilld verifies a Skill](/verify) for what the check covers.

## skilld outdated

Report outdated and unmanaged Skills.

| Flag | Help |
|---|---|
| `--all` | Check both scopes and every Agent target directory. |

```sh
skilld outdated --all
```

## skilld auth

Manage account authentication.

| Subcommand | Result |
|---|---|
| `login` | Sign in to a skilld.dev account. The credential lands in the operating system keychain. |
| `status` | Show the signed-in account. |
| `logout` | Remove the credential. |

```sh
skilld auth login
```

Private Repository delivery needs a login. See [Use Skills from private Repositories](/learn/private-repositories).

## skilld config

Manage configuration.

| Subcommand | Result |
|---|---|
| `get <KEY>`{lang="html"} | Read one value. |
| `set <KEY> <VALUE>`{lang="html"} | Write one value. |
| `list` | Show every value. |

```sh
skilld config set agent.targets codex,claude-code
```

Known keys: `agent.targets` and `install.mode`.
