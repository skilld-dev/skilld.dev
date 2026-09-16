---
title: How skilld verifies a Skill
description: What a source status means, which checks the skilld CLI runs before it writes a file, and what skilld never claims about a Skill.
label: Trust
author: Harlan Wilton
command: npx skilld run owner/repo/skill
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

**TL;DR.** `verified` means skilld checked where a Skill came from and that the bytes match that source. It says nothing about the instructions inside. Read the Skill before you run it. `skilld run` prints it and writes nothing.

## What a source status means

Every installed Skill records one source status in `.skills/skilld-lock.yaml`. The skilld CLI defines three values:

- `verified`: skilld checked a skilld.dev Artifact and its attestation.
- `local`: the Skill came from a local directory or a bundled skilld-maintained Skill.
- `unverified`: direct mode fetched the Skill from public GitHub.

`verified` describes provenance checks. It does not endorse the instructions inside a Skill.

`skilld list` shows the status of each installed Skill. `skilld verify <skill>` runs the source check again.

## What skilld checks

GitHub is the source of truth. skilld.dev builds an immutable Artifact from one exact Git commit. The CLI does not trust an Artifact because the API served it. It runs these checks before it writes a file.

1. **Trusted root key.** Each production build carries a compiled root key. The CLI fetches the current trusted root and compares it to that key. If a build has no root key, the CLI stops with `TRUSTED_ROOT_UNCONFIGURED`.
2. **Statement bytes.** The Artifact attestation carries a signed statement. The CLI decodes it and compares it field by field with the attestation. One changed byte fails the check.
3. **Signature.** The statement signature must verify against a key the trusted root names.
4. **Check results.** The attestation lists each check skilld.dev ran on that commit, with its version and outcome. If a required check did not pass, the CLI stops with `CHECK_BLOCKED`.
5. **Size and digest.** The archive size and SHA-256 digest must match the attestation. The Artifact id is that digest.
6. **Archive structure.** The archive must contain exactly the files the attestation lists. Nothing extra, nothing missing.

Only after all six does the Skill land on disk with the `verified` status. The lockfile records the exact Git commit, so a later `skilld install` restores the same bytes.

## What skilld never claims

skilld never rates the instructions inside a Skill. No source status says a Skill will do no harm to your project. No badge on skilld.dev says that either.

`verified` is a claim about provenance: who wrote the file, which commit it came from, and whether the bytes you hold match that commit. The judgement about what the Skill tells your Agent to do stays with you.

## Read a Skill before you run it

`skilld run` prints `SKILL.md` to stdout. Your Agent reads it and follows it for this session. A remote run writes no Skill files. It creates no lockfile entry, Agent target, project file, or Skill cache.

```sh
npx skilld run owner/repo/skill
```

A Skill can carry supporting files. `skilld run` names them and prints none of them. Read one when the instructions call for it:

```sh
npx skilld run owner/repo/skill --revision <commit> --file references/api.md
```

skilld never prints executable or binary files. A Skill that must run its own script needs an install, and an install writes files. Ask first.

## Third-party checks and provenance

Some registries run audits on listed skills and show the vendor's badge next to each one. That answers a different question. An audit rates the content at one point in time, by one vendor's rules.

Provenance is a fact you can check yourself. The author, the Repository, the commit, and the source file are one click away on every skilld page. The attestation shows each check result by name, with its outcome. skilld records that evidence and shows it. It leaves the verdict to you.
