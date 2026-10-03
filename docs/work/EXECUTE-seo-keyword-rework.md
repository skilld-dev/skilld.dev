# SEO keyword rework

Status: open · 2026-10-03 · title experiment ended 2026-08-26; measurement delegated to SEO recovery

**Next move:** Ready. Review the production `marketing` and `research` pins. Follow SEO recovery for measurements and indexing decisions.

Done means: every indexable surface names its target query, its admission bar and its cull path, and the measurement window in this document has been read against Search Console rather than projected.

Measurement plan superseded by [EXECUTE-seo-recovery.md](EXECUTE-seo-recovery.md). Read that brief for what to measure and when.

## Ledger

- [x] Baseline recorded 2026-08-12
- [x] The surfaces listed under Shipped, below
- [x] Close the original head-term title experiment under the recorded 2026-08-26 title pivot
- [ ] `marketing` and `research` pins read by a human against the production rows
- [x] Delegate the remaining measurement window to SEO recovery, with its first read on 2026-10-12

## Log

- 2026-10-03 Reconciled the initial title blocker with this brief's August 26 decision.
  The original head-term proposal is historical. Further title changes require a new decision under COPY and VISION.
  No fresh Search Console results were read during this check-in.

- 2026-09-22 moved out of the repository root as `SEO.md`. The ledger above is read off this document's own Open section; nothing was re-measured. The absolute keyword volumes in here are not a traffic forecast, as its own caveat says.

Tracking doc for the keyword rework begun 2026-08-12. The strategy lives in
VISION.md; this file records what shipped, what it targets, and what to measure.

## The finding that set the direction

Demand is **not** on `agent skills for <foo>` (react, flutter, codex, copilot all
sit at 10/mo). It is on **`claude <domain> skills`** and **`claude skills for
<domain>`**, plus a head cluster around directory/repository/marketplace terms.

Competitor proof: skillsmp.com draws 2,744 of its 2,769 monthly organic visits
from its **homepage alone**. Its 2M skill pages earn ~0. Hub pages rank; scaled
detail pages do not. That is the same lesson as the 2026-06 suppression, arrived
at from the outside.

## Baseline, 2026-08-12

Measure against these. Do not re-derive them; they were taken before any change.

| Metric | Value |
| --- | --- |
| GSC clicks, 3 months | 4 |
| GSC impressions, 3 months | 2,627 |
| Brand term `skilld` | position 63 |
| Indexable skills | 5,610 |
| Top query | junk long-tail (`"dopplerhookinitializer" github`, 97 impressions) |

Nothing ranked, which is why slug renames cost nothing.

## Shipped

All live and verified in production on 2026-08-12.

| Surface | Title | Targets | Vol/mo |
| --- | --- | --- | --- |
| `/skills` | Claude Skills Directory | `claude skills directory`, library/registry variants | ~260 + tail |
| `/skills/trending?range=all` | Top Claude Skill Repositories on GitHub | `claude skills github`, `claude skills repo`, `claude skills repository`, `top claude skills` | ~4,100 |
| `/skills/best` | Best Claude Skills, Reviewed and Ranked | `best claude skills`, `best claude code skills` | ~1,780 |
| `/skills/design` | Claude Skills for UI and Design | design/UI cluster | ~660 |
| `/skills/coding` | Claude Skills for Coding | coding cluster | ~310 |
| `/skills/writing` | Claude Skills for Writing | writing cluster | ~240 |
| `/skills/seo` | Claude Skills for SEO | `claude seo skills` (KD **0**) | ~190 |
| `/skills/context-engineering` | Agent Skills for Context Engineering | `agent skills for context engineering` (KD **5**) | ~200 |
| `/skills/marketing` | Claude Skills for Marketing | marketing cluster | ~1,350 |
| `/skills/research` | Claude Skills for Research | research/academic cluster | ~630 |
| 9 more categories | long-tail only | no measurable head term | – |

Also: 16 categories replaced 10 clusters + 13 collections; 12 collections
retired into category pins with 301s; indexable skills 5,610 → 5,883.

`seo`, `marketing`, `research`, `writing` are tagged `audience: 'test'` in
`clusters.ts`. They sit outside VISION's north-star user and exist to measure
whether non-developer traffic converts. Reversing that experiment is a
four-row delete.

## Decisions taken, with reasons

- **`claude skills marketplace` (3,600/mo) deliberately not targeted.** The
  largest term found, and what skillsmp.com ranks #1 for. Nothing on skilld is
  sold and pay-to-play is anti-scope, so the word would misdescribe the product.
- **`best` used, with evidence.** Brand guidelines ban superlatives *without*
  evidence and permit them with it. `/skills/best` leads with the admission bar
  rather than asserting a rank. Reversible in one line if the call changes.
- **`what are claude skills` (1,600/mo) skipped.** Anthropic's own support and
  platform docs hold #1 and #5. Not winnable, and it embeds no skills.
- **Examples library not built.** Would target ~1,180/mo but duplicates the 16
  category pages, which already list skills with descriptions. Revisit only if
  `/skills/best` performs.

## Open

- **Homepage title** is the tagline ("Curated agent skills by humans"), fixed by
  COPY.md. The head terms want "Claude Skills" in it, and the
  homepage is where skillsmp.com earns nearly all its traffic. A brand decision,
  not an SEO one.
- **Codex research** (`task-msq8bfh8-wob26q`, spawned 2026-08-12) never
  reported. `/skills/best` was built without it. If its findings contradict the
  structure, that is rework already in production.
- **`marketing` and `research` pin quality.** Both were repinned against
  production after the first pass turned out to reference skills that are not in
  the registry. Worth a human read of the actual rows.

## Title pivot, 2026-08-26

Every `<title>` moved from "Claude Skills" to "Agent Skills". 17 strings: the 13
category `seoTitle` rows in `clusters.ts`, the three `/skills/trending` ranges,
`/skills` and `/skills/best`. URLs, H1s, and descriptions did not change, so no
redirect is involved and the principle 6 cross-agent claim still sits in the
descriptions.

The reason: the head-term bet drew nothing. Over the three months to 2026-08-26
no `claude * skills` query recorded a single impression. Site totals for the
same window are 2 clicks and 2,278 impressions, and the 28-day window is 2
clicks and 202 impressions across 122 pages, down from 8,799 pages with
impressions over three months. Every hub page the rework built is at or near
zero: `/skills/trending` 0 impressions, `/skills/best` 1, `/skills/design` 1,
`/skills/coding` 8.

This ends the 2026-08-12 experiment two weeks before its 2026-09-10 read date.
Recorded as a deliberate call, not an oversight: an experiment returning zero
signal on its primary metric does not need its full window to be judged.

The pivot was **not** supported by fresh volume data. DataForSEO returned
`provider_payment_required` on 2026-08-26, so `research keywords` could not run.
The 2026-08-12 research still says `agent skills for <foo>` is weak (10/mo) and
`claude <domain> skills` is the larger term. That research now conflicts with
this change and has not been re-run. Re-check it before spending further effort
on either noun.

## What to measure, and when

Recrawl lag means nothing here is readable before **2026-09-10** (four weeks).
Check at that point, then again at eight:

1. `gsc_query` type `keywords`, period `28d`: does any `agent * skills` term
   appear at all? Any impression is signal from a baseline of zero. The
   `claude * skills` form recorded zero over the three months to 2026-08-26,
   which is what retired it.
2. `inspect_url` on `/skills/best`, `/skills/trending?range=all`, `/skills/seo`: are
   they indexed, and did the sitemap get read?
3. Indexed count trend. The 2026-06 scar was scaled content; if indexed pages
   climb while impressions stay flat, the additions read as thin and should be
   culled, not expanded.
4. The four `audience: 'test'` categories: do they draw impressions, and do
   those sessions reach an install command? If they draw traffic that never
   installs, delete the rows.

## The caveat that governs all of it

Every keyword in this research shows a collapsing trailing trend. `claude skills
marketplace` runs `5400 → 9900 (peak) → 3600 → 880 → 320 → 0 → 0 → 0`;
`agent skills` peaks at 18,100 and ends at 70. The `vol` figures above are
12-month **averages** carried almost wholly by the peak.

Two readings: DataForSEO clickstream lag, or genuine post-launch decay. This was
not resolved. The **relative ordering** between terms is trustworthy and is what
the page priorities rest on. The **absolute numbers are not a traffic forecast**
and should not be used as one.
