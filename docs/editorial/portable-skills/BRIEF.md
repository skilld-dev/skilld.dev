# Portable Skills pilot

Scope: one article at `/learn/create-agent-skills`, plus natural links from Learn and project authoring.
Reader: a maintainer who wants one reusable Skill across Claude Code, Codex and Gemini CLI.
Question: how do I create Claude Skills that also work with other Agents?
Outcome: write an instruction-only example, expose documented discovery paths, then test selection and output.
Loop 1 action: run the existing project-authoring Skill, then publish a readable source others can run.
Keep its run command first. Link package-specific work to the existing authoring guides.
This page owns cross-Agent mechanics. The project guide links here instead of gaining a duplicate compatibility section.
It does not create an agent-by-agent article series or a general guides expansion.
Exclude: every-agent guarantees, hosted-chat uploads, new renderers and unrelated rewrites.

Foundations: [sources](SOURCES.md), [claims](VERIFIED-CLAIMS.md), [voice](../../../COPY.md), [figures](SCREENSHOTS.md).
Claims: P01 through P08. Primary sources opened 2026-10-05.
SEO: `how to create claude skills`, US 2840, 390/month estimate, KD 30.
Contribution: complete Skill, discovery table, portable replacements and concrete test inputs.
Outline: shared format, example, discovery, runtime limits, checks, authoring links.
Example: `review-release-notes/SKILL.md`, reviews supplied release notes against a supplied diff.
Replay: supply a diff adding `timeoutMs` with default 5000 and notes claiming a default of 10000.
Expect a finding citing the supplied diff, then corrected notes stating 5000.
Negative input: ask for CSS colors. Expect no activation through task matching.
Missing input: supply notes without a diff. Expect a request for release evidence before review.
No runtime or credentials required for the example.
Checks: parser, links, H1, metadata, canonical, robots, desktop/mobile, client navigation and record exclusion.
Real Agent execution remains unverified until recorded sessions exist.
Admission: add this route to the freeze audit and admit it using P06.
Cull: remove admission to emit noindex and exclude from the sitemap.
Review at the existing 2026-11-11 SEO gate.
Publication authority: open a PR for Harlan. The production workflow deploys after merge.
Article label names Codex as drafter. Never claim human review before it occurs.

## Review ledger

Brief: reviewed by independent brief_review Agent on 2026-10-05.
Resolved findings: corrected quickstart scope, concrete replay inputs, bounded Loop 1 action.
Invocation: `Use review-release-notes to check these notes against this diff`.
Session scope: fresh local Claude Code, Codex and Gemini CLI sessions.
Moved the project guide's generic review lines into the new concrete review checklist.
Article: factual and editorial review passed by independent article_review Agent on 2026-10-05.
Factual review found that correct output alone does not prove activation.
Added discovery-list and activation-trace checks, plus a matching prompt without the Skill name.
Added the specification's leading and trailing hyphen constraint.

## Observed checks, 2026-10-05

- Nuxt parsed the article into the Learn collection. One H1, specific title and description.
- Built preview served canonical `https://skilld.dev/learn/create-agent-skills` and `index,follow`.
- Pages sitemap included the article and excluded editorial records. Editorial source route returned 404.
- Desktop 1440px and mobile 390px rendered without document overflow. Mobile table scrolls within its container.
- Client navigation from Learn and the project guide reached the article and review anchor.
- Extracted the published example and parsed it through `loadSkilldMaintainedSkill`.
- Both modified authoring Skills parsed and ran through local `skilld run`.
- The article's remote run command resolved `generate-project-skill` through skilld.dev.
- Site lint passed with existing warnings. Typecheck, production build and all 2,867 tests passed.
- `skilld-harness` lint, typecheck, build and all 102 tests passed.

The first concurrent check run failed because generated Nuxt files moved during the build.
The sequential rerun passed. No authenticated or real model execution path was tested.
No article screenshots ship. Private layout captures remain in `~/scratch/portable-skills/`.

Humanize pass: kept the concrete procedure; removed any claim that format proves runtime completion.
Final factual review preserved model limits, dates, source links and replay expectations.
