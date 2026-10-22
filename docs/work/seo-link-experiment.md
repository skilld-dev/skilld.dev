# Experiment B: link candidates

The [candidate manifest](seo-link-experiment-candidates.json) records ten existing, admitted Skill destinations checked on 21 October 2026.
It separates recruitment evidence from the [original recovery panel](seo-recovery-panel.json).
The 11 November gate and indexing freeze still apply.

## Selection evidence

The pool was the first 50 reviewed individual Skill Repositories from the [Repository leaderboard](https://skilld.dev/api/skills/leaderboard?page=1).
This pool is ordered by GitHub stars. It is not the global top 50 Skills.
Stars help order recruitment; they do not grant indexing admission.

Each candidate met these checks:

- A different Repository from every original panel Repository and the 20 October public README link sample.
- An existing canonical Skill destination in the Skills sitemap.
- A direct HTTP 200 response, indexing allowed, and a self-canonical URL.
- A resolved source, current indexing admission, and a healthy public Repository.
- No `skilld.dev` string in its checked default-branch README, recorded with its blob SHA.
- HTTP 200 SVG responses from both badge themes, generated through the existing embed helper.
- A retained Google inspection reporting `URL is unknown to Google`.

The README check does not establish absence of links elsewhere.
The Repository exclusions avoid known overlap. They do not create a matched untreated control.
Playwright was screened out because its retained baseline already reported crawled, not indexed.

## Baseline dates

The retained Google checks span 20 August to 13 October.
Reading them on 21 October does not make them current.
They are dated pre-recruitment evidence, not current or day-zero Google verdicts.
HTTP indexability does not prove that Google indexed a page.

Before activating a candidate, read its latest retained inspection and repeat the cheap eligibility checks.
If the Google check predates adoption, record that timing gap.
Do not infer the page's state on the adoption day from older evidence.
If a candidate already progressed, preserve that evidence and exclude it from the unknown-to-crawled transition count.
Do not run fresh inspections merely to align the original panel.

## Link activation

Preparation does not start a measurement window.
Keep each candidate's `adoption._tag` as `awaiting-link` until an outside link is verified live.
Then replace that object with a `live-link` record containing:

- `sourceUrl`: the public page containing the link.
- `sourceBlobSha`: the README blob SHA, when the source is GitHub.
- `targetUrl`: the exact linked canonical Skill destination.
- `firstObservedAt`: the first verified live observation, in UTC.
- `sourceCommittedAt`: the source commit time, when available; keep it separate from the observation time.
- `linkKind`: badge or plain link.
- `renderedRel`: the observed attributes, or an explicit unavailable result.

Do not assume a followed link from README source alone.
Add verified live destinations to `b_linked` as they land, up to ten URLs.
Keep every original group, URL, exclusion, and observation.
Keep each candidate's history when its eligibility changes; do not silently replace an activated destination.

## Measurement

Start each URL's 14-day window at its own first verified live link.
Record both the Google inspection time and the last reported crawl time.
A crawl transition needs a reported crawl after the link; an old crawl timestamp does not qualify.
An indexed result needs a post-link inspection reporting indexed status.
An old inspection, provider error, or missing Checkpoint leaves the result unavailable.
Missing evidence is not a failed experiment.

The threshold remains five qualifying moves among ten live destinations.
Count moves from unknown or discovered to crawled or indexed.
If fewer than ten links land, report recruitment progress separately from the ten-URL threshold.
This observational result can justify further investigation. It cannot attribute the change to the links.
Sitewide changes, baseline gaps, and maintainer self-selection remain confounders.

A full 14-day window at the 11 November gate needs a link by 28 October.
Later links have incomplete windows at that gate. Keep their later read dates explicit.
Keep the gate date; do not turn incomplete windows into failures.

## Outreach

Check each maintainer's current contribution and issue guidance before publishing a request.
Use one relevant channel. Ask before preparing an external pull request.
Keep any proposed link optional and useful to the Repository's readers.
Offer a plain link alongside the badge. Do not exchange rewards or require ranking credit.
Google's [link spam policy](https://developers.google.com/search/docs/essentials/spam-policies#link-spam) covers links created primarily to manipulate rankings.

Personal outreach drafts remain separate from this public measurement record.
Publishing under Harlan's name requires approval of the exact message.
