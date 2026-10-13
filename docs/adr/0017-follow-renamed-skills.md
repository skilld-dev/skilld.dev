# ADR-0017: Follow renamed Skills

**Status:** Accepted
**Date:** 2026-10-13

Extends [ADR-0015](0015-follow-moved-repositories.md) from Repositories to the Skills inside one.

## Context

The registry names a Skill after its folder. When an author renames the folder,
sync saw one Skill disappear and another appear. The old page became a 410
tombstone, its likes and collection entries stayed behind, and old run commands
failed. The new name started with no history.

On 2026-10-13 `harlan-zw/brundlefly` renamed `im-not-a-fly` to `im-part-human`
and `im-a-fly` to `im-not-a-human`. The old pages answered 410 and the new
names answered 404.

## Decision

Sync detects a rename and follows it.

- Detection runs in a sync's final sweep, once the tree's full name set is
  known. A candidate pair is a name the tree no longer holds and a Skill first
  seen in this sync. The removal and the addition can come from different
  invocations of one sync, so both copies are read from D1.
- The pair must share at least 60% of the distinct body lines of their
  `SKILL.md`, frontmatter excluded, and each must be the other's single best
  match. Brundlefly's renamed Skills scored 0.97 and 0.99 against their old
  copies and 0.00 against everything else. An ambiguous pair stays a removal
  and an addition.
- A name the sweep already marked gone still pairs. A scheduled sync can sweep
  the old name before an index request admits the new one.
- The old name's rows move to the new name in the sync's final batch, through
  the same Skill table list a Repository move uses. A clash keeps the row under
  the new name. The new name keeps the first-seen date of the old one.
- The old name stays as a `skill_aliases` row. `/gh/<owner>/<repo>/<old-name>`{lang="html"},
  every path under it, and its `.md` copy answer 301 to the same path under the
  new name, in one hop. A later rename rewrites older aliases. A rename back
  deletes the alias.
- `skilld run <owner>/<repo>/<old-name>`{lang="html"} keeps working. The registry
  answers the old name with the new identity.

`layers/registry/server/utils/skill-rename.ts` holds detection and the rename.
`layers/registry/server/middleware/gh-renamed-skill-redirect.ts` answers old URLs.

## Consequences

A rename adds no indexable page and keeps the Skill's likes, collection
entries, revisions, and history. The new name still needs admission like any
new Skill. For a Repository that only a submission admits, the owner's index
request brings the new name in, and that sync records the rename.

Every renamed Skill is queued in `skill_dirty` with reason `skill_renamed`. The
`embedding` marker stays under the old name, as in a Repository move.

Only a folder rename inside one Repository is detected. A rename that also
rewrites more than about 40% of the body reads as a removal and an addition. A
move of a Skill between Repositories reads the same way.

Cull path: there is none while old URLs receive traffic. Dropping
`skill_aliases` ends every redirect.

## Rejected alternatives

Redirecting a removed Skill to its Repository page would point an old URL at a
page that is not its equivalent. Search engines treat that as a soft 404, and
the site was suppressed once for scaled low-value pages. A removal without a
detected rename keeps its 410.

Rename detection from GitHub's compare API needs a stored base commit and one
more request for each sync. The cached `SKILL.md` already answers the question.

An author-declared previous name, for example in frontmatter `metadata`, is
exact, but no Agent Skills convention defines it today.
