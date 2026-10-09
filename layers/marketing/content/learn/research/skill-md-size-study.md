---
title: 'SKILL.md size and descriptions: 12,141 Skills measured'
description: 'Original skilld research into Skill descriptions, instruction sizes, and reference files across 2,297 repositories. Includes source measurements and weighting comparisons.'
label: 'Original research · 9 October 2026'
author: skilld
publishedAt: '2026-10-09'
updatedAt: '2026-10-09'
---

**8.9% of measured Skill bodies reach or exceed 5,000 estimated tokens.** Give each repository equal weight, and that figure becomes **10.8%**. The sample and its weighting change the answer.

We measured **12,141 Skills across 2,297 repositories** in a frozen skilld registry snapshot. The median description contains **288 characters**. The median whole `SKILL.md` file is **7.3 kB**, while its instruction body contains **1,600 estimated tokens**.

These measure different things. Descriptions help an Agent select a Skill. Instructions enter context when that Skill activates. Reference files hold material the Agent can read later. Combining their sizes into one score hides those differences.

This study examines each separately. It also tests how duplicate descriptions, large collections, and repository weighting affect the findings.

## Most Skill bodies fit within the recommended size

The [Agent Skills specification](https://agentskills.io/specification#progressive-disclosure) recommends instruction bodies below 5,000 tokens. It also recommends keeping the main file below 500 lines.

Of **12,138 source-matched bodies**, **1,078** reach or exceed 5,000 estimated tokens. Three historical source versions were unavailable for body measurement.

::skill-size-study{chart="body"}
::

The mean body contains **2,331 tokens**, compared with a median of **1,600**. The 90th percentile is **4,748**. The 95th percentile reaches **6,828**. Larger files pull the mean above the middle of the sample.

Our colour bands show context use. Green means at most 2,500 tokens, an editorial half-budget marker. Amber means 2,501 to 4,999. Red means at least 5,000. A long Skill can still be useful. A short Skill can omit necessary instructions.

These counts use `o200k_base`, not every Agent's native tokenizer. They estimate relative context use rather than exact billing or truncation behaviour across models.

## Task categories reveal different file sizes

Design Skills have the largest mean whole-file size among the recognised task categories: **13.1 kB**. Data Skills average **8.1 kB**. Design Skills also contain more reference files on average: **3.75**, compared with **1.49** for data Skills.

::skill-size-study{chart="topics"}
::

The file-size column includes YAML frontmatter and the Markdown body. Its bars show bytes, so they use a neutral colour. The context bands in the first chart use body tokens.

The task categories come from a model assessment of descriptions. **4,068 descriptions** do not support a confident primary task category. They stay visible as “Task category uncertain”. Removing them would conceal a third of the corpus.

Reference counts include files under a `references/` directory. They exclude scripts, assets, and other supporting files. **12,091 inventories** are complete enough for this measure. Fifty remain missing. A complete inventory with no references contributes zero.

Across the full filtered corpus, the mean reference count is **2.27**, while the median is **zero**. Most Skills do not resemble the reference-heavy tail.

## Short descriptions are not automatically clearer

The specification caps a description at **1,024 characters**. It also asks authors to explain both the task and the situation where it applies. Those requirements do not establish a universal ideal length.

We assessed four description properties with Jev 1.13:

- Does it identify a concrete task and its subject or output?
- Does it identify a recognisable request or selection situation?
- Does it define a bounded scope?
- Does it contain substantial repetition or filler?

::skill-size-study{chart="descriptions"}
::

In the group below 100 characters, **45.5%** met the model's clear-guidance threshold. In the 400 to 599 character group, **81.4%** met it.

This is an association within the sample. It does not show that adding words improves a description. Task complexity, author habits, and the model rubric can all affect the result.

The categories also leave room for uncertainty. Overall, **73.4%** met the clear-guidance threshold, **25.7%** remained uncertain, and **0.9%** received “Needs work”.

These are exploratory model judgements. We have not calibrated them against an independent human-labelled registry sample or tested actual Agent selection accuracy. They should guide inspection rather than become a quality badge.

The median description contains **288 characters**. Its mean is **345**, and its 90th percentile is **664**. **111 descriptions** exceed 1,024 characters, a measurable specification constraint separate from semantic clarity.

## The sample matters as much as the average

The source export contains **20,510 registry rows**. Of those, **19,348** have a resolved source, a successful render, and a nonblank string description.

The main study applies skilld's existing aggregator exclusion. That removes **7,207 descriptions across 35 repositories**, leaving **12,141 Skills**. The excluded group accounts for **37.2%** of usable descriptions.

Those repository flags predate this study. They are registry classifications, not an independent claim that every excluded repository mirrors another source. We expose them in the dataset so readers can choose a different population.

| Description population | Skills | Repositories | Mean characters | Median characters |
| --- | ---: | ---: | ---: | ---: |
| All usable source descriptions | 19,348 | 2,332 | 334 | 287 |
| Existing aggregator flags excluded | 12,141 | 2,297 | 345 | 288 |
| Excluded aggregator group | 7,207 | 35 | 315 | 286 |
| Unique normalised descriptions, filtered | 11,760 | 2,281 | 346 | 288 |

For description deduplication, we trim leading and trailing whitespace and collapse whitespace runs. Exact text without that normalisation produces **11,764** unique descriptions.

Deduplication barely moves the mean description length. Repository weighting changes it more.

| Weighting | Mean description characters | Mean body tokens | Bodies at or above 5,000 tokens |
| --- | ---: | ---: | ---: |
| Each Skill contributes equally | 345 | 2,331 | 8.9% |
| Each repository contributes equally | 383 | 2,593 | 10.8% |

For repository weighting, we calculate each repository's mean or proportion first. We then average those repository results. A repository containing one Skill has the same weight as a repository containing hundreds.

Body weighting covers **2,296 repositories** with at least one matched body. Description weighting covers all **2,297** filtered repositories.

We also deduplicated whole source files by raw SHA-256. Among **11,983 measured unique files**, **8.9%** reach 5,000 tokens. Exact file duplicates therefore have little effect on this particular result.

The averages describe a registry snapshot. They do not describe the Skills a typical developer installs. We did not weight by installs, GitHub stars, active usage, or Agent sessions.

## What Skill authors put in descriptions

“Code” appears in **1,837 descriptions**, “review” in **1,252**, and “build” in **1,181**. Each word counts once per description, even when repeated.

::skill-size-study{chart="words"}
::

The cloud uses English alphanumeric words, lowercase, with a minimum length of three characters. We remove a published common-word list and apply no stemming. “Review” and “reviewing” remain separate.

This is a vocabulary view. It does not establish which terms improve selection or represent descriptions in every language.

## What to change in your own Skill

Start with selection guidance. Name the task, its input or output, and the situation where the Skill applies. Remove repeated claims before removing useful constraints.

Measure the body separately. If it approaches the recommended token or line budget, inspect which details belong in focused reference files. Keep the common workflow in `SKILL.md` and link the extra material where the Agent needs it.

Moving text into references does not guarantee lower total context use. The Agent can still read those files. It gives the Agent a chance to load detail when the task needs it.

Check format with [`skills-ref validate ./my-skill`](https://agentskills.io/specification#validation). That command checks frontmatter and naming conventions. It does not test whether the Skill solves a task. This study reports measurements and description assessments, rather than corpus-wide validator results.

Then test real requests, including requests where the Skill should stay inactive. [Claude's authoring guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) recommends testing Skills through real usage.

For a complete authoring path, use our [guide to creating Skills for Claude Code, Codex and Gemini CLI](/learn/create-agent-skills). To inspect existing source before a run, [browse Skills](/skills).

## Method and downloads

**Snapshot:** `2026-10-09-v1`, frozen skilld registry export. This is an original registry study, not a reproduction of the skills.sh top-installed sample.

**Source identity:** each measurement carries repository, Skill name, source path, source commit, Git blob SHA, and raw SHA-256. Body measurements require the matching source version. Missing historical bodies remain null.

**Description length:** Unicode code points from the frontmatter description. File size uses UTF-8 bytes. One kB equals 1,000 bytes.

**Body size:** YAML frontmatter removed before counting. `gpt-tokenizer` 4.0.0 with `o200k_base` estimates tokens. Line counts refer to the body, separately from the whole-file line recommendation.

**Reference inventories:** count paths beneath `references/` only when the stored supporting-file inventory matches its recorded file count. Missing inventories never become zero.

**Assessment:** Jev 1.13.0, rubric `2026-10-09-v1`, using description text only. Clear guidance requires task, activation, and scope scores of at least 0.8, with filler at most 0.2. Needs work requires a score of at most 0.2 on any required property, or filler at least 0.8. All remaining results are uncertain. These scores are model outputs, not calibrated correctness probabilities.

**Task categories:** use the model's primary category only when its score reaches 0.8. Otherwise retain “Task category uncertain”. Assessment details and prompts are linked below.

**Statistics:** arithmetic means and nearest-rank percentiles. Skill-weighted results are the default. Repository-weighted results average per-repository statistics. Description duplicates use normalised-text hashes. File duplicates use raw SHA-256. No confidence intervals are claimed for this nonrandom sample.

**Reproduction:** download the measurements and run `pnpm exec tsx scripts/research/build-size-study.ts` in the [site repository](https://github.com/skilld-dev/skilld.dev). The generator rebuilds the summary from the committed frozen measurements. The manifest records export and measurement hashes. Source commits let readers inspect the original files.

- [Measurements as CSV](/research/skill-md-size-2026-10-09/measurements.csv)
- [Measurements as JSON](/research/skill-md-size-2026-10-09/measurements.json)
- [Summary and weighting comparisons](/research/skill-md-size-2026-10-09/summary.json)
- [Snapshot provenance and hashes](/research/skill-md-size-2026-10-09/provenance.json)
- [Word counts and common-word list](/research/skill-md-size-2026-10-09/words.json)
- [Shareable size infographic](/research/skill-md-size-2026-10-09/avg-skill-md-size.png)
- [Assessment rubric and thresholds](https://github.com/skilld-dev/skilld.dev/blob/main/scripts/lib/description-review.ts)

Codex prepared the analysis, charts, and article from skilld's source measurements. The model assessments are exploratory. This study does not establish Skill safety, Agent performance, or the effect of description length on task success.

When citing this study, use **skilld, “SKILL.md size and descriptions: 12,141 Skills measured”, 9 October 2026**, and include the snapshot identifier `2026-10-09-v1`.
