# ADR-0018: Answer renamed Skill runs with the new name

**Status:** Accepted
**Date:** 2026-10-13

Amends the run-command decision in [ADR-0017](0017-follow-renamed-skills.md).

## Context

ADR-0017 let `skilld run <owner>/<repo>/<old-name>`{lang="html"} resolve the renamed
Skill's identity. `skilld` then refused the Artifact: it checks that the Skill it
receives carries the name it asked for, and answered `SOURCE_MISMATCH` with
"skilld.dev delivered the Skill im-part-human, not the Skill this ref names".

That check stops a registry from substituting one Skill for another. A rename
should not weaken it.

## Decision

Delivery does not build a renamed Skill under its old name. A request that names
an old Skill name answers 404 with code `SOURCE_NOT_FOUND`, and the problem
detail names the new name and the command to run it:

```text
The Skill im-not-a-fly was renamed to im-part-human. Run skilld run harlan-zw/brundlefly/im-part-human.
```

`findSkillRunIdentity` no longer follows a Skill alias. `findRenamedSkill` reads
the alias, and `/api/skills/run-identity` reports it as `renamedTo`.

## Consequences

Released CLIs show the problem detail as written, so this needs no CLI release.
The reader, or the agent acting for them, runs the new name on purpose. The
CLI's name check stays as strict as before.

A Repository move still resolves old run commands to the new identity, as
ADR-0015 decided.

## Rejected alternatives

A rename field in the Resolution answer, accepted by a new CLI, would keep old
commands running. It needs a protocol release and a CLI release, and it relaxes
the substitution check for every renamed Skill.
