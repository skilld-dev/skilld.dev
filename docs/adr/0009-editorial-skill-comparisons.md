# ADR-0009: Editorial Skill comparisons

Date: 2026-10-05

## Context

Writing Skills share names and pattern lists but differ in voice, scope, and required files.
A track lists Skills for a kind of work. It does not explain those tradeoffs.
Comparison content serves anonymous discovery to run, the first product loop.
Scaled pairwise pages would repeat the site's earlier indexing failure.

## Decision

Own comparisons in the marketing layer at `/compare/<slug>`.
Keep Markdown in `layers/marketing/content/comparisons` with its own content collection.
Use one explicit Vue route per editorial article. Do not generate candidate pairs or a thin index.
Reuse `useMarketingArticle` and `MarketingArticle` for rendering, canonical URLs, and the primary run action.
Keep research and editorial requirements in [comparison architecture](../arch/comparisons.md).

Require a target query, source review date, review deadline, scope, method, disclosure, and pinned sources.
The comparison schema rejects moving source links, mismatched repositories, duplicate Skills, and invalid review ordering.
These checks establish evidence topology. Editorial review still establishes whether a claim follows from that evidence.

Every `/compare` route enters the existing page admission gate.
Without a recorded admission, it renders `noindex,follow` and leaves the pages sitemap.
Admission follows the existing measured-demand or named-experiment bar. A content file alone cannot grant indexing.
Removing the admission record is the cull path.

The first article compares source instructions. It makes no measured output-quality ranking.
A future hands-on method needs a later decision and a schema with reproducible output evidence.

## Consequences

A new pillar adds no D1 table, public API operation, scheduler, or cross-layer utility import.
Research uses skilld search and run. A delivery failure permits independent pinned-source review, never a provenance bypass.
A blocked candidate can remain as an identified source comparison, with no working run claim.
Unpublished local Skills can inform internal research but earn no remote command or ranked placement.

Comparison pages have one primary question: which Skill fits this draft?
Their primary action runs the chosen Skill. Installing stays the optional second step.
