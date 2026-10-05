# Internal linking strategy

Checked 2026-10-05. Target: `/learn/create-agent-skills`.
Reader question: how do I write one Skill and check it across coding Agents?
The article keeps the authoring query. Agent pages keep their discovery and use queries.

## Evidence and limits

- Source inspection found two existing inbound pages: Learn and project authoring.
- Both use `noindex,follow`. This limits the strategy to more than authoring-page links.
- NuxtSEO 0.5.3, Site `s_08aae654`, retained `audit link-structure` shows the authoring chooser in header links.
- The chooser also uses `noindex,follow`. Header frequency does not establish ranking value.
- `audit link-opportunities` covered 397 of 1,825 pages and returned zero suggestions.
  This partial crawl does not establish that no useful links exist.
- Retained Search Console `pages`, period `28d`, returned 60 rows with no further page.
  The homepage row had 82 impressions and zero clicks. No relevant Agent or authoring guide row appeared.
  Missing rows do not prove zero demand. These data cannot identify a donor with proven click traffic.
- Crawl capture dates and the exact Search Console window dates were absent from these responses.
  Treat retained counts as planning context, not a measurement of this branch or a traffic forecast.

## Link map

| Source | Placement | Anchor | Destination | Role |
| --- | --- | --- | --- | --- |
| `/` | Existing maintainer authoring section | complete portable Skill example | Article root | Direct path from the indexable homepage |
| `/agents/claude-code` | After the Skill explanation | Create a Claude Code Skill | Article root | Indexable discovery page to authoring procedure |
| `/agents/codex` | After discovery explanation | Write a Skill that works across Agents | Article root | Indexable discovery page to cross-Agent procedure |
| `/agents/gemini-cli` | After discovery explanation | Create a portable Agent Skill | Article root | Useful reader path; noindex source |
| Five package authoring guides | Review step | the cross-Agent selection and task checks | Article review fragment | Reuse the checklist when reviewing each package Skill |
| `/learn` | Existing guide card | Create Skills for Claude Code, Codex and Gemini CLI | Article root | Existing navigation path |
| `/learn/author-project-skills` | Existing review step | the cross-Agent checks | Article review fragment | Existing project-authoring path |

The package guides cover npm, PyPI, Go, Rust and Ruby.
They remain noindex. Their links serve readers; they are not counted as indexable donor pages.
No source admission or robots rule changes.

## Constraints

Use standard rendered anchors with `href` and concise text that describes the destination.
Place links beside the question they answer. Do not add a sitewide footer link or repeat exact keywords everywhere.
Keep the source citations in the article. External citations and internal navigation serve different purposes.
Keep the existing run command and authoring CTA. No parallel provider-specific tutorial is needed.

Authority: [Google's link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
Google recommends contextual internal links and descriptive text. It specifies no ideal link count.
The expected benefit is easier discovery and a clearer authoring relationship. No ranking lift is claimed.

## Verification and measurement

Check every source's server-rendered anchor, robots and canonical.
Follow source links through client navigation. Confirm the destination heading and review fragment.
Check homepage and Agent-page desktop/mobile placement without altering their main action.
Keep this record outside the content collections, navigation and sitemap.

After the production workflow delivers the reviewed revision, observe the live links and target canonical.
Capture a dated Search Console baseline after delivery. Retain the exact start and end dates.
Compare it with an equal-length dated later window for the target's impressions, clicks and queries.
A traffic change alone cannot establish that internal links caused it.
At the existing 2026-11-11 SEO gate, use that evidence to keep, revise or cull the article.
An empty query response is not proof that the links failed.

## Observed preview checks, 2026-10-05

The built Worker returned HTTP 200 and server-rendered target links from all eleven source routes.
Their canonical and robots directives confirmed the three indexable donors and eight noindex reader paths.
The target review fragment exists. The pages sitemap includes the article and excludes editorial records.
The strategy record's public route returned 404.
Independent article_review accepted the final donor copy, link placements and measurement limits.
The article's accepted file digest remains unchanged.
