# ADR-0013: Follow moved Repositories

**Status:** Accepted
**Date:** 2026-10-07

Replaces [ADR-0002](0002-freeze-registry-repository-identity.md).

## Context

ADR-0002 froze the registry identity at admission. A renamed or transferred
Repository kept its old `owner/repo` in every table and URL, and
`repos.source_owner` and `repos.source_repo` carried the new name for [GitHub](https://github.com)
reads.

That left pages and run commands on names GitHub no longer serves. On
2026-10-07 the run sweep found 229 Skills in 13 Repositories failing on GitHub's
301, `facebook/react` among them. Production held 503 Repositories under a name
that GitHub had moved. In two cases the new name was already a separate
registry Repository with the same Skills: `hyf0/vue-skills` and
`vuejs-ai/skills`, and `shadcn/ui` and `shadcn-ui/ui`. Those were duplicate
indexable pages.

## Decision

The registry follows GitHub. When sync reads a Repository and GitHub answers
with another name, every row moves to that name in one D1 batch.

- GitHub's numeric Repository ID survives renames and transfers. Sync stores it
  in `repos.repository_id` and records it on the alias.
- The old name stays as a `repo_aliases` row. `/gh/<old-owner>/<old-repo>`{lang="html"} and
  every path under it answer 301 to the same path under the new name, in one
  hop. A later move rewrites older aliases to the newest name. A move back
  deletes the alias.
- When the registry already holds the new name, the rows merge into it. A clash
  keeps the row under the new name.
- A root Skill takes the Repository name, so a rename renames it. The alias
  keeps both names, so its old page redirects too.
- `skilld run <old-owner>/<old-repo>/<skill>`{lang="html"} keeps working. The registry
  answers the old name with the new identity, and delivery follows GitHub's
  301 to the Repository ID.
- Discovery evidence, skills.sh observations, and sync checkpoints keep the
  name they recorded.

`layers/registry/server/utils/repository-move.ts` holds the move.
`scripts/move-repositories.ts` runs the same statements as a one-off backfill.

## Consequences

Pages, sitemaps, and run commands show the name GitHub serves. The 301 carries
the old URL's links to the new one. The move adds no indexable page: each Skill
keeps its admission, and a merge removes a duplicate. VISION principle 2 holds.

Every moved Skill is queued in `skill_dirty`, so trust and indexability are
recomputed for the new identity. The `embedding` marker stays under the old
name. The vector ID hashes the name, so the nightly prune deletes the old vector
and the next generation embeds the new name.

Static lists keyed by name, such as `official-repos.ts` and the track pins in
`clusters.ts`, must name the new Repository. An official Repository lists both
names until no row carries the old one.

Moves come from GitHub, not from a person. A Repository whose old name GitHub
gives to another Repository becomes live again once the registry admits it, and
its alias stops redirecting.

Cull path: there is none while old URLs receive traffic. Dropping
`repo_aliases` ends every redirect.

## Rejected alternatives

Keeping ADR-0002 meant run commands and pages named Repositories GitHub no
longer serves, and duplicate Repositories stayed as duplicate pages.

A redirect without a move would answer every page view with a lookup and keep
two names for one Repository in every table.
