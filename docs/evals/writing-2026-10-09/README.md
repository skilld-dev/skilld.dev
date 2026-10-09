# Writing evaluation, 9 October 2026

Six Skills rewrote the same three generated Markdown documents.
OpenCode 1.18.32 used `zai-coding-plan/glm-5.3` for every successful run.
Each Skill ran once. The baseline ran once without Skill instructions.
This run compares writing instructions, not Skill discovery or a stable quality ranking.

[Recording evidence](record.json) contains exact commits, source hashes, timings, and transcript hashes.
[Seed prompt](seed-prompt.txt) and [rewrite prompt](rewrite-prompt.txt) preserve the shared inputs.
Each directory contains the unedited Markdown output and raw OpenCode events.
The demo manifest stores these same documents for the existing reader.

## Results

The no-Skill baseline already removes the seed's obvious padded wording.
All six Skills preserve the exact code block, URLs, and inline identifiers.
The seed and baseline also pass those exact material checks.
Those checks do not establish complete factual preservation or writing quality.

Word counts below include headings and exclude fenced code. Shorter does not mean better.

| Run | Article words | README words | PR words |
| --- | ---: | ---: | ---: |
| seed | 217 | 123 | 131 |
| baseline | 157 | 88 | 109 |
| humanizer | 174 | 77 | 94 |
| stop-slop | 148 | 81 | 103 |
| no-ai-slop | 114 | 88 | 77 |
| anti-slop | 158 | 80 | 102 |
| deslop-writing | 133 | 67 | 84 |
| im-not-a-fly | 132 | 79 | 86 |

## Meaning changes found during agent review

These observations compare outputs with the supplied fictional facts.
They are agent assessments, not a human review or an automated quality score.

| Run | Observation |
| --- | --- |
| Baseline | Keeps the app limitations, package behavior, existing category field, and PR exclusions. Adds a generic closing summary. |
| Humanizer | Changes the article's “can be more useful” into “is more useful.” Adds “The rest of the interface is unchanged” to the PR. |
| Stop Slop | Changes “can be more useful” into “serves you better.” Keeps the PR's existing-field detail and exclusions. |
| No AI Slop | Keeps the article's qualified comparison. Omits the PR's detail about using the existing category field. |
| Anti Slop | Keeps the article's qualified comparison. Adds “The rest of the interface is unchanged” to the PR. |
| Deslop Writing | Adds an unsupported requirement that links only become a reading list after sorting. Strengthens the final comparison. Omits the existing-field detail and adds an unchanged-interface claim. |
| Brundlefly im-not-a-fly | Keeps the qualified comparison, existing-field detail, and PR exclusions. Adds a generic causal claim about structure in the article's opening. |

The PR brief says the change maintains simplicity. It does not establish that every other interface element is unchanged.
All README outputs retain case sensitivity, original ordering, the empty-category behavior, and the unchanged input array.
They also retain the limits on fetching URLs and storing links.
All PR outputs retain bookmark behavior, reload reset, and the search and saved-preference exclusions.

## Limits

The topic is fictional. The runner provides the facts and all Markdown source files inside each Skill directory.
The runner disables tools, so Skills cannot inspect external sources or execute scripts.
The model receives Skill instructions inline, including bundled Markdown references.
The baseline uses the same task and original documents without those instructions.
The run uses no temperature override or repeat trials.
The run uses published Brundlefly commit `67d1cf8e3543133a4d73b8a857ff8fc988717956`.
It does not exercise the local checkout's uncommitted `write-human` files.
OpenCode Go rejected an earlier seed attempt because its subscription was inactive.
No output from that attempt enters this comparison.
