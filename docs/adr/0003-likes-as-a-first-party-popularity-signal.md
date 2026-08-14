# ADR-0003: Likes as a first-party popularity signal

**Status:** Accepted
**Date:** 2026-08-10

## Context

VISION anti-scope 4 states that popularity is never the quality signal, and
names [GitHub](https://github.com) stars as the one sanctioned popularity signal. That rule was
written against a specific failure: install counts scraped from skills.sh, a
third-party number we could not source, could not verify, and could not defend
if challenged. Stars survived the rule because they are verifiable at the
canonical source.

Separately, the per-skill affordances on skilld had stopped working. "Watch for
changes" never read back existing subscription state, so a user already watching
a repo was shown the same invitation again. "Save to collection" required the
user to already own a collection, and its anonymous path emitted an OAuth action
token that no server handler consumed, so the intent was dropped after sign-in.
Neither control appeared on skill cards or repo pages, leaving Loop 2 with no
entry point anywhere on the browse path.

Both are replaced by a single primitive: liking a skill. A like records taste
and derives the repo-level digest subscription, so the user performs one gesture
instead of understanding two.

A like is a number attached to a skill, so anti-scope 4 applies to it.

## Decision

Like counts are public and may order browse surfaces, as a narrow exception to
anti-scope 4.

Two properties distinguish likes from the counts the rule was written to reject:

1. **First-party and sourceable.** A like is a row we wrote, keyed to a
   GitHub-authenticated user. We can state exactly what the number counts. A
   scraped install count fails this test; that rejection stands.
2. **Skill-grained.** Stars measure a repository. A repository of twenty skills
   lends the same star count to all twenty, including the weak ones. Likes
   measure the unit the registry curates.

### Boundaries

The exception covers display and an opt-in sort key. It covers nothing else.

- Likes never feed `skill-trust.ts`. Trust tiers stay human judgment plus
  owner-verified facts.
- Likes never affect admission.
- Likes never become the default order. `/skills` continues to default to
  `stars`, per the ROADMAP "Now" horizon; `?sort=likes` is a choice the user
  makes.
- Likes never appear in a "trending" or "hot" surface, which would convert a
  count into an editorial claim we did not make.

## Consequences

`skills.like_count` is denormalized and recomputed by the existing `skill_dirty`
queue, matching `curator_count`. Drift is checked by `/admin/integrity`.

A public, sort-eligible count is worth gaming. GitHub OAuth is the primary
barrier, since a like requires an account. A 200-per-day per-user cap in
`likeSkill` is the backstop. This is the first rate limit on a user-facing write
in the codebase, and it exists because ordering makes the number worth attacking.

Anti-scope 4 in VISION.md is amended to name this carve-out inline rather than
deleted, following the pattern principle 6 already uses for its SEO carve-out.

## Revert condition

If like counts are observed being farmed, or if the sort produces an order a
curator would not endorse, the sort key is removed first and the display second.
Removing the sort key is a one-line change to `SkillsListQuery`; the data stays,
so nothing is lost by reverting early.

## Rejected alternative

We rejected keeping like state private, with no count shown. That reading is the
safest against anti-scope 4 and costs nothing to build. It was rejected because a
private like is invisible to everyone but its author, so it can never tell a
visitor which skills people who use this stack keep. The signal is worth
more than the rule protects, provided the boundaries above hold.
