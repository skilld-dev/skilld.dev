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
Replay: supply a diff exporting `timeoutMs = 5000` and notes claiming a default of 10 seconds.
Expect a finding citing the supplied diff, then corrected notes stating 5 seconds.
The export does not prove a runtime default. Flag that unsupported inference too.
Negative input: ask for CSS colors. Expect no activation through task matching.
Missing input: supply notes without a diff. Expect a request for release evidence before review.
No runtime or credentials required for the example.
Checks: parser, links, H1, metadata, canonical, robots, desktop/mobile, client navigation and record exclusion.
Use [replay evidence](REPLAY.md) for observed sessions and remaining execution limits.
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
The sequential rerun passed. These initial checks did not exercise authenticated or real model execution paths.
No article screenshots ship. Private layout captures remain in `~/scratch/portable-skills/`.

Humanize pass: kept the concrete procedure; removed any claim that format proves runtime completion.
Final factual review preserved model limits, dates, source links and replay expectations.

## Content-refresh re-review, 2026-10-05

Parent revision: `b2ad27337190367aaefe18d0c1169af948fa8b4e`.
Independent reviewers: article_review and brief_review. Coordinator: Codex.
Findings: isolate the missing-input session, qualify the exported value, explain Gemini consent,
and preserve dated trial evidence with complete replay instructions.
Humanize pass: clarified permission configuration while retaining shared authorization rules.
Added [replay evidence](REPLAY.md). Cross-Agent completion stays unresolved.
Final article SHA-256: `10c533da43a4196e022b2dfe174344088e713213ca1d0237ed300880d17ddd62`.
Both independent reviewers accepted that exact digest on 2026-10-05 after checking the corrections and replay evidence.
Coordinator acceptance: Codex inspected the final article, source checks and revised records.
Remaining limit: Claude and Gemini task completion, plus production delivery, require separate observation.
Collection pass: formatted the Learn introduction's `SKILL.md` as code after the renderer autolinked the bare filename.

## Internal linking follow-up, 2026-10-05

User requested a linking strategy for the article.
See [link map and evidence limits](LINKING.md).
Add contextual entry points from the homepage, the three covered Agent pages and package-review steps.
Only homepage, Claude Code and Codex are indexable donors under the existing admission rules.
The final article and its accepted digest are unchanged.
Independent linking review: article_review accepted the placements and donor eligibility.
Resolved findings: qualify donor compatibility claims, correct Claude's loaded-context claim,
and require dated equal-length Search Console windows without causal attribution.
