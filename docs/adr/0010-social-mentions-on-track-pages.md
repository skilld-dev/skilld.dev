# ADR-0010: Social mentions on track pages

**Status:** Accepted
**Date:** 2026-10-06

## Context

ADR-0004 admitted social mentions as an ordering signal on two surfaces only:
`/skills/trending` and the weekly email. Its constraints keep both signals off
the default browse surfaces.

A track page (`/skills/<slug>`{lang="html"}) lists the Skills for one kind of work. Until
now it led with three pinned Skills, then a card grid in a fixed order: pinned
Skills, then classified Skills, then [GitHub](https://github.com) stars. Nothing on the page said
what ordered the grid. Harlan asked for track pages to reuse the trending
board, so `/skills/design` shows the design Skills devs talk about.

The data supports this for some tracks only. Measured in production on
2026-10-06, the Skills with at least one qualifying post in the last seven
days numbered, per track: planning 7, design 6, context-engineering 5,
diagrams 3, coding 2, seven tracks 1, and two tracks 0. Over 30 days the count
reached 5 or more on six tracks. About three quarters of the Skills devs post
about have no classifier category yet, so they cannot belong to a track.

## Decision

A track page may order a section of its board by social mentions, under the
same test ADR-0004 applies: we can state what the number counts, and a reader
can check it at the source.

- **One section, headed with its claim.** The section heading names the track
  and the window, such as "Design skills devs talked about this week". The line
  under it states the ranking rule. The score is the trending board's,
  narrowed to the track's members. The board's demotion of the most-starred
  repositories does not apply: it can put a Skill one dev posted about above
  one seven devs posted about, which the stated rule forbids.
- **Posts only.** Star surges never enter the section. The heading says devs
  talked about each row, and a surge is not a dev talking.
- **Every row ships its posts.** A socially ranked row shows the post that put
  it there, with its author and link, as on `/skills/trending`.
- **A minimum before the section leads.** The section appears only when at
  least five Skills in the track qualify (`MIN_TALKED_SKILLS`). Below that, the
  Skills stay in the lists below and draw no posts, and a line states how many
  of them devs talked about.
- **Every other section names its order.** Pinned Skills sit under a
  hand-picked heading in the order a person set. The rest sit under a heading
  that ends "ranked by GitHub stars". No section borrows the talked section's claim.

## Constraints that still hold

- Neither signal feeds trust tiers or admission. Track membership stays the
  classifier category and the pins a person writes.
- Installs remain barred. Likes remain barred from ordering a ranked board.
- The URL, `<title>`{lang="html"}, meta description, and indexability rule of each track
  page do not change. A `?range=month` board canonicalises to the track URL.
- The homepage's organizing principle stays curation and freshness. This ADR
  covers track pages only.

## Consequences

VISION anti-scope 4 gains a pointer to this ADR beside the ADR-0004 carve-out.

The talked section depends on the classifier. A Skill without a category
cannot appear in a track, however much devs post about it. Classifying newer
Skills faster widens the section; nothing in this ADR does that.

If a track section ever ranks by mentions without its posts, or a heading
claims devs talked about rows they did not, this ADR no longer covers it.
