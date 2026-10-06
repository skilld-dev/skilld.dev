# ADR-0014: Symbolic links in a Skill folder

Date: 2026-10-07

Amends [ADR-0013](0013-artifact-size-limits-and-linked-files.md).

## Context

A build refused every Skill folder that held a symbolic link, with `INVALID_SOURCE: The Skill source layout was rejected.`
The 2026-10-07 sweep found 108 such Skills, the largest class still refused.

- 103 are `simota/agent-skills/*`. Each Skill folder links the shared `_common` folder at the Repository root, and some link `_templates` too.
- `austintgriffith/ethskills` links `AGENTS.md`, `CLAUDE.md`, and `llms.txt` to `SKILL.md`.
- `garrytan/gstack` links `connect-chrome` to `open-gstack-browser`.
- The two `twostraws` Skills link `skills/<name>/references` to the Skill's own `references`.
- `oaustegard/claude-skills/agent-routing` links `agent-routing` to `../../agent-routing`, outside the Repository.

`tar --dereference` cannot pack simota/agent-skills.
`_common` links every Skill folder back, so tar recursed 5,800 folders deep and crashed.

## Decision

A build follows each symbolic link in the Skill folder at the same commit.
The skilld CLI receives regular files, so the attestation, the Resolution answer, and the CLI are unchanged.

### Resolution

The link blob holds a path. The build reads it through the REST API and checks it against the blob SHA.
It resolves the path from the link's own folder by POSIX rules: `..` leaves the folder, and a link on the way resolves in turn.

- A file becomes one file at the link path.
- A folder becomes every file in it, under the link path.

Each file keeps its own Git blob SHA from the tree, so the build checks its bytes like any other file.
The files count against the limits of ADR-0013. A file a link put in the Skill is never a linked file: [GitHub](https://github.com) serves no file at the link path.

### Refused

These links refuse the Skill, with the existing summary and one finding each:

| Link | Finding |
|---|---|
| An absolute path | `the target is an absolute path` |
| `..` past the Repository root | `the target is outside the Repository` |
| A path through `.git` | `the target is inside .git` |
| A path that does not exist at the commit | `the target does not exist at this commit` |
| A path into a Git submodule | `the target is in a Git submodule` |
| A chain that comes back to a link it passed | `the link loops` |
| A chain through more than 8 links | `the target passes through more than 8 links` |
| A folder above the Skill folder that holds it | `the target folder holds the Skill folder` |
| A blob that is not a UTF-8 path of at most 4,096 bytes | `the link does not hold a valid path` |

A Skill folder may hold 64 links, and following them may cost 128 GitHub reads.

### Left out

Two kinds of link are left out. Following them would repeat the same files without end.

- A link inside a folder that a link names. The build does not read it.
- A link to a folder inside the Skill that holds the link, such as `atlas/reference/atlas -> ../../atlas`. The Skill already packs every file in it.

Refusing the second kind would keep 22 of the 103 simota Skills refused.

### The check result

The `symbolic-links` check is not required, so a released CLI accepts it.
It warns when the Skill folder holds a link, and lists each one: `_common -> ../_common` when followed, or the link and the reason when left out.
A stored build that followed a link is not checked again from its bytes, because the bytes do not show which files a link put there.

### The archive

The bytes of a file a link put in the Skill sit at the target path in the Repository archive, not at the link path.
So the archive no longer lists every file in Artifact order.

- An entry that passes before its turn stays in memory, up to 8 MiB in one pass.
- A file whose target comes later waits for it, when the files it holds back fit in that memory.
- Any other file reads its bytes from `raw.githubusercontent.com` at the target path.

A Skill without links streams as before and holds nothing.

### Private builds

A private build follows links by the same rules. It reads one blob per file, so the reads the links cost come out of its 900-file limit.

## Consequences

A sweep built the 108 Skills with this change on 2026-10-07:

| | Before | After |
|---|---|---|
| Ready | 0 | 107 |
| Refused | 108 | 1, `oaustegard/claude-skills/agent-routing`, whose only link leaves the Repository |
| Files read from `raw.githubusercontent.com` | | 2, both in `garrytan/gstack` |
| Slowest build | | 1.1 s |
| Most memory one build added | | 11.5 MiB, `garrytan/gstack` |

The policy is `2026-10-07.4`. The previous policy `2026-10-07.3` stays signable, because it refused every link.
A ready build under it held no link, so it is checked again from its bytes.

The skilld CLI reads an installed copy back as a local Skill on `skilld update`, and refuses one of more than 512 files.
`simota/agent-skills/hone` packs 527 files and `garrytan/gstack` 2,000. A run is not affected.
