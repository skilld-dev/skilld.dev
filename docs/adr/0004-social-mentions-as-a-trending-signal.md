# ADR-0004: Social mentions as a trending signal

**Status:** Accepted
**Date:** 2026-08-19

## Context

VISION anti-scope 4 was written against one specific failure: install counts
scraped from skills.sh. That number could not be sourced, could not be verified,
and could not be defended if challenged, so the rule barred unverifiable
third-party counts from ordering any surface. [GitHub](https://github.com) stars survived the rule
because they are verifiable at the canonical source.

The rule also closed with "[likes] never power a trending surface", written when
no trending surface existed and the only candidate signal for one was a count we
did not trust.

A trending surface now exists at `/skills/trending`, and the weekly email ships
its top rows. Neither is ordered by installs, and neither is ordered by likes.
They are ordered by two other signals:

1. **Social mentions.** `sync-x-mentions` and `sync-bsky-mentions` read the
   public APIs of X and Bluesky, store every qualifying post in
   `skill_social_posts`, and match the named skill against the vocabulary its
   own repository ships. Each row keeps the post URL, the author handle, the
   text, the platform, and the engagement on that specific post.
2. **Star surges.** `detect-star-surges` records daily star observations per
   repository. A surge attributes to a skill only when the repository holds
   exactly one, so the surge cannot belong to anything else.

Both are already constrained in code. `authorWeight` dilutes an author by how
many skills their post named, because one "here are 20 repos" thread otherwise
handed every entry an identical score and buried the repos people were actually
posting about. A minimum engagement bar drops posts nobody reacted to.

## Decision

Social mentions and star surges may order a trending surface. They are admitted
under the same test that admitted stars and rejected installs: can we state
exactly what the number counts, and can a reader check it at a canonical source?

- **Sourceable.** Every social-attributed row carries the post that named the
  skill, linked. A reader who doubts the claim can open it and read it.
- **First-party observation, third-party statement.** We do not resell someone
  else's aggregate. We record public statements ourselves, keep the evidence,
  and show it.
- **Attributed per row, never over a list.** A row states which route named it:
  a person named it, its repository surged, or both. A heading may never make a
  claim on behalf of rows that did not earn it. Production once served four
  star-attributed rows with `authorCount: 0` under a heading reading "Named by
  developers", which was false for every one of them. That is the failure this
  clause exists to prevent.

## Constraints that still hold

- Neither signal feeds trust tiers. Admission and the highest trust signals stay
  human judgments (principle 1, anti-scope 4).
- Neither signal affects admission.
- Neither signal orders the default browse surfaces. The homepage's organizing
  principle stays curation and freshness.
- Installs remain barred entirely. This ADR does not reopen them.
- Likes remain barred from ordering a trending surface. ADR-0003 is unchanged;
  a like is our own users' taste and would make the board a mirror.
- A trending surface with too few evidenced rows tops up from stars and must
  label those rows as such rather than passing a star count off as conversation.

## Consequences

VISION anti-scope 4 gains a second carve-out naming this ADR, and its closing
clause narrows from "never power a trending surface" to the likes-specific rule
it was always describing.

The signal is only as honest as the evidence shown beside it. If a future
surface ranks by mentions without showing the post, this ADR no longer covers
it and the rule that rejected installs applies again.
