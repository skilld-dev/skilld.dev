# ADR-0010: Trending awards

**Status:** Accepted
**Date:** 2026-10-06

## Context

The trending boards change every hour. A Skill that ranked third last week has no record of it
once it leaves the board. Maintainers ask for proof they can keep, and a README badge that links
back to the Skill page is the channel VISION already names: the install command spreading
through maintainers' own READMEs.

VISION names badges as something the growth-hacking Skill author wants. The concern there is a
badge a maintainer can farm or buy. A trending award repeats a claim the board already made in
public, with the post or the star surge that put the row there.

## Decision

Record a trending award for every evidenced row on the `week` and `month` boards.

- An evidenced row has a post that named the Skill or a star surge on a repository holding
  exactly one Skill. Star filler earns nothing. The `all` range earns nothing, because it ranks
  by lifetime stars.
- An award is keyed by Skill, board, and calendar period in UTC: the ISO week starting Monday,
  or the month. It keeps the best rank the board showed during that period.
- `record-trending-awards` samples the boards hourly. It never removes a row and never worsens
  a rank.
- The Skill page shows the best award beside the heading. The README badge adds it on request
  with `?trending=1`. Both always show the period, because an undated rank reads as current.
- Awards are display only. They never feed trust, admission, indexability, or ordering.

## Consequences

The award inherits the board's evidence. If the board ranking changes, past awards keep the rank
the old board showed, which is what readers saw at the time.

Awards are separate from the SEO admission experiment in `trending-admission.ts`. Ending that
experiment does not end awards.

Cull path: drop the `record-trending-awards` task, remove the chip and the badge option, then
drop `skill_trending_awards`.
