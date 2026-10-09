---
title: 'SKILL.md size and descriptions: 12,141 Skills measured'
description: 'We measured 12,141 Skills across 2,297 repositories. Compare description lengths, body tokens, and reference files, with source data and methods.'
label: 'Original research · 9 October 2026'
author: skilld
publishedAt: '2026-10-09'
updatedAt: '2026-10-09'
---

**8.9% of measured Skill bodies reach or exceed 5,000 estimated tokens.** Give each repository equal weight, and that figure becomes **10.8%**.

We measured **12,141 Skills across 2,297 repositories** in a frozen skilld registry snapshot. The median description contains **288 characters**. The median whole `SKILL.md` file is **7.3 kB**, while its instruction body contains **1,600 estimated tokens**.

Descriptions help an Agent select a Skill. The body supplies instructions when that Skill activates. Reference files hold details it can read later. Each uses context at a different stage, so we measured them separately.

## Most Skill bodies fit within the recommended size

The [Agent Skills specification](https://agentskills.io/specification#progressive-disclosure) recommends instruction bodies below 5,000 tokens. It also recommends keeping the main file below 500 lines.

Of **12,138 source-matched bodies**, **1,078** reach or exceed 5,000 estimated tokens. Three historical source versions were unavailable for body measurement.

::skill-size-study{chart="body"}
::

The mean body contains **2,331 tokens**, compared with a median of **1,600**. The 90th percentile is **4,748**. The 95th percentile reaches **6,828**. Larger files pull the mean above the middle of the sample.

The green band stops at 2,500 tokens, half the recommended body budget. That boundary is our editorial choice. Amber covers 2,501 to 4,999 tokens; red starts at 5,000. The colours measure context use. They do not score how useful a Skill is.

We counted tokens with `o200k_base`. An Agent using a different tokenizer will count differently. These estimates cannot reproduce its exact billing or truncation behaviour.

## Task categories reveal different file sizes

Design Skills have the largest mean whole-file size among the recognised task categories: **13.1 kB**. Data Skills average **8.1 kB**. Design Skills also contain more reference files on average: **3.75**, compared with **1.49** for data Skills.

::skill-size-study{chart="topics"}
::

The file-size column includes YAML frontmatter and the Markdown body. Its neutral bars show bytes. The first chart's colour bands use body tokens.

Jev assigned task categories from the descriptions. It could not confidently place **4,068** of them. We kept those rows under “Task category uncertain”, rather than dropping a third of the corpus.

We counted files under `references/`, excluding scripts, assets, and other supporting files. **12,091 inventories** were complete enough to count. Fifty remain missing. A complete inventory with no references contributes zero.

The mean reference count is **2.27**, while the median is **zero**.

## Short descriptions are not automatically clearer

The specification caps a description at **1,024 characters** and asks authors to explain the task and when it applies. It does not prescribe an ideal length within that limit.

We assessed four description properties with Jev 1.13:

- Does it identify a concrete task and its subject or output?
- Does it identify a recognisable request or selection situation?
- Does it define a bounded scope?
- Does it contain substantial repetition or filler?

::skill-size-study{chart="descriptions"}
::

In the group below 100 characters, **45.5%** met the model's clear-guidance threshold. In the 400 to 599 character group, **81.4%** met it.

This comparison does not show that adding words improves a description. Task complexity, author habits, and the rubric can also affect the result.

Across all descriptions, **73.4%** met the clear-guidance threshold, **25.7%** remained uncertain, and **0.9%** received “Needs work”.

We have not calibrated these model judgements against an independent human-labelled registry sample or tested actual Agent selection accuracy. Treat the labels as prompts for inspection.

The median description contains **288 characters**. Its mean is **345**, and its 90th percentile is **664**. **111 descriptions** exceed the specification's 1,024-character cap, regardless of how clear they are.

## The sample matters as much as the average

The source export contains **20,510 registry rows**. Of those, **19,348** have a resolved source, a successful render, and a nonblank string description.

The main study applies skilld's existing aggregator exclusion. That removes **7,207 descriptions across 35 repositories**, leaving **12,141 Skills**. The excluded group accounts for **37.2%** of usable descriptions.

The aggregator flags predate this study. We did not independently verify that every flagged repository mirrors another source. The downloadable rows include the flags, so you can compare either population.

| Description population | Skills | Repositories | Mean characters | Median characters |
| --- | ---: | ---: | ---: | ---: |
| All usable source descriptions | 19,348 | 2,332 | 334 | 287 |
| Existing aggregator flags excluded | 12,141 | 2,297 | 345 | 288 |
| Excluded aggregator group | 7,207 | 35 | 315 | 286 |
| Unique normalised descriptions, filtered | 11,760 | 2,281 | 346 | 288 |

To find duplicate descriptions, we trim leading and trailing whitespace and collapse whitespace runs. Comparing the exact text instead gives **11,764** unique descriptions.

Deduplication barely moves the mean description length. Repository weighting changes it more.

| Weighting | Mean description characters | Mean body tokens | Bodies at or above 5,000 tokens |
| --- | ---: | ---: | ---: |
| Each Skill contributes equally | 345 | 2,331 | 8.9% |
| Each repository contributes equally | 383 | 2,593 | 10.8% |

For repository weighting, we calculate each repository's mean or proportion, then average those results. A repository with one Skill contributes as much as one with hundreds.

Body weighting covers **2,296 repositories** with at least one matched body. Description weighting covers all **2,297** filtered repositories.

We also removed duplicate source files using their raw SHA-256 hashes. Of **11,983 measured unique files**, **8.9%** reach 5,000 tokens. The result barely changes.

This is a registry snapshot. We did not weight by installs, GitHub stars, active usage, or Agent sessions. The averages cannot tell you what a typical developer has installed.

## What Skill authors put in descriptions

“Code” appears in **1,837 descriptions**, “review” in **1,252**, and “build” in **1,181**. Each word counts once per description, even when repeated.

::skill-size-study{chart="words"}
::

The cloud uses English alphanumeric words, lowercase, with a minimum length of three characters. We remove a published common-word list and apply no stemming. “Review” and “reviewing” remain separate.

The cloud shows common vocabulary in the English tokens we extracted. It cannot tell you which words improve Skill selection or describe every language.

## What to change in your own Skill

Start with selection guidance. Name the task, its input or output, and the situation where the Skill applies. Remove repeated claims before removing useful constraints.

If the body approaches the recommended token or line budget, look for details you can move into reference files. Keep the common workflow in `SKILL.md`. Link the extra material from the step that needs it.

The Agent may still read every reference file. Splitting the files lets it load details as needed, without guaranteeing lower total context use.

Run [`skills-ref validate ./my-skill`](https://agentskills.io/specification#validation) to check frontmatter and naming conventions. It does not test task completion. We have not run the validator across this corpus.

Then test real requests, including requests where the Skill should stay inactive. [Claude's authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) recommends testing Skills through real usage.

Our [guide to creating Skills for Claude Code, Codex and Gemini CLI](/learn/create-agent-skills) covers the authoring steps. You can also [browse Skills](/skills) and read their source before a run.

## Method and downloads

**Snapshot:** `2026-10-09-v1`, frozen skilld registry export. The population differs from the skills.sh top-installed sample.

**Source identity:** each measurement carries repository, Skill name, source path, source commit, Git blob SHA, and raw SHA-256. Body measurements require the matching source version. Missing historical bodies remain null.

**Description length:** Unicode code points from the frontmatter description. File size uses UTF-8 bytes. One kB equals 1,000 bytes.

**Body size:** YAML frontmatter removed before counting. `gpt-tokenizer` 4.0.0 with `o200k_base` estimates tokens. Line counts refer to the body, separately from the whole-file line recommendation.

**Reference inventories:** count paths beneath `references/` only when the stored supporting-file inventory matches its recorded file count. Missing inventories never become zero.

**Assessment:** Jev 1.13.0, rubric `2026-10-09-v1`, using description text only. Clear guidance requires task, activation, and scope scores of at least 0.8, with filler at most 0.2. Needs work requires a score of at most 0.2 on any required property, or filler at least 0.8. All remaining results are uncertain. These scores are model outputs, not calibrated correctness probabilities.

**Task categories:** use the model's primary category only when its score reaches 0.8. Otherwise retain “Task category uncertain”. The rubric link below includes the prompts.

**Statistics:** arithmetic means and nearest-rank percentiles. Skill-weighted results are the default. Repository-weighted results average per-repository statistics. Description duplicates use normalised-text hashes. File duplicates use raw SHA-256. No confidence intervals are claimed for this nonrandom sample.

**Reproduction:** download the measurements and run `pnpm exec tsx scripts/research/build-size-study.ts` in the [site repository](https://github.com/skilld-dev/skilld.dev). The generator rebuilds the summary from the committed frozen measurements. The manifest records export and measurement hashes. Source commits let readers inspect the original files.

- [Measurements as CSV](/research/skill-md-size-2026-10-09/measurements.csv)
- [Measurements as JSON](/research/skill-md-size-2026-10-09/measurements.json)
- [Summary and weighting comparisons](/research/skill-md-size-2026-10-09/summary.json)
- [Snapshot provenance and hashes](/research/skill-md-size-2026-10-09/provenance.json)
- [Word counts and common-word list](/research/skill-md-size-2026-10-09/words.json)
- [Shareable size infographic](/research/skill-md-size-2026-10-09/avg-skill-md-size.png)
- [Assessment rubric and thresholds](https://github.com/skilld-dev/skilld.dev/blob/main/scripts/lib/description-review.ts)

Codex prepared the analysis, charts, and article from skilld's source measurements. We measured source properties and model judgements. We did not test Skill safety, Agent performance, or how description length affects task success.

When citing this study, use **skilld, “SKILL.md size and descriptions: 12,141 Skills measured”, 9 October 2026**, and include the snapshot identifier `2026-10-09-v1`.
