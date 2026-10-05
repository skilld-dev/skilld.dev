---
title: "Humanizer vs Stop Slop vs No AI Slop: writing Skills compared"
description: "Compare Humanizer, Stop Slop, and No AI Slop by editing workflow, voice preservation, fact checks, and required files."
label: "Source review · 5 October 2026"
author: "Harlan Wilton"
authorGithub: "harlan-zw"
command: "npx skilld run petergyang/no-ai-slop/no-ai-slop"
targetQuery: "best humanizer skill for claude"
reviewedAt: "2026-10-05"
reviewDueAt: "2027-01-05"
scope: "Three English prose editors lead an 18-Skill discovery sample by GitHub Repository stars. Two alternatives add distinct workflows."
methodology: "source-review"
disclosure: "Harlan Wilton is the author. An agent assisted with research and drafting. Brundlefly shares a maintainer with skilld and informed the review method. It receives no placement."
sources:
  - selector: blader/humanizer/humanizer
    revision: 225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8
    url: https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md
  - selector: hardikpandya/stop-slop/stop-slop
    revision: 8da1f030185bdfe8471220585162991eaeb970e9
    url: https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md
  - selector: petergyang/no-ai-slop/no-ai-slop
    revision: 000650b156983f5159695b441477f4e63b25dc85
    url: https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md
  - selector: elithrar/dotfiles/anti-slop
    revision: 4b38887ec969bbc1c97c1434732fac97ea7ff0dd
    url: https://github.com/elithrar/dotfiles/blob/4b38887ec969bbc1c97c1434732fac97ea7ff0dd/.agents/skills/anti-slop/SKILL.md
  - selector: kmaida/deslop-skills/deslop-writing
    revision: 70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b
    url: https://github.com/kmaida/deslop-skills/blob/70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b/deslop-writing/SKILL.md
---

Humanizer, Stop Slop, and No AI Slop target repetitive, generated-sounding prose.
Their instructions take different approaches: a complete rewrite, strict style rules, or a light edit and audit.
Choose based on how much you want changed and how closely you need to preserve facts and voice.

These three lead our 18-Skill discovery sample by GitHub Repository stars.
Stars describe Repository popularity, without measuring editing quality.
We compared their instructions, without benchmarking generated rewrites.

## Humanizer for a complete rewrite

::comparison-skill-card
---
owner: "blader"
repo: "humanizer"
name: "humanizer"
to: "/gh/blader/humanizer"
source: "https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md"
description: "A full rewrite with a final check for added or lost claims."
---
::

Humanizer makes preservation checks part of the editing workflow.
It allows paragraph changes, but treats unsupported additions and lost claims as errors.
For factual or technical prose, it asks for neutral, plain language.
For personal writing, it preserves uncertainty, humor, and mixed feelings.

Its pasted-text mode shows intermediate work before the final rewrite.
If you only want small phrasing changes, No AI Slop's minimum-edit instruction is a closer fit.
Read [the reviewed Humanizer source](https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md) before choosing it for a file edit.

## Stop Slop for a strict house style

::comparison-skill-card
---
owner: "hardikpandya"
repo: "stop-slop"
name: "stop-slop"
to: "/gh/hardikpandya/stop-slop"
source: "https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md"
description: "Strict style rules for drafting, editing, and reviewing prose."
---
::

Stop Slop is a compact directive for drafting, editing, and reviewing prose.
It targets filler, formulaic structure, vague claims, and repetitive rhythm.
Its score covers directness, rhythm, reader trust, authenticity, and density.
That score is its own editorial rubric, without a shared benchmark across these Skills.

Its rules require removing all adverbs and passive constructions.
Check those constraints against your house style before applying them to a whole document.
Read [the reviewed Stop Slop source](https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md) and its linked references.

## No AI Slop for a light edit or audit

::comparison-skill-card
---
owner: "petergyang"
repo: "no-ai-slop"
name: "no-ai-slop"
to: "/gh/petergyang/no-ai-slop"
source: "https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md"
description: "A light edit, or a findings report without a rewrite."
---
::

No AI Slop separates editing from detection.
Edit mode keeps distinctive sentences and returns a short explanation of changes.
Detect mode quotes the pattern, describes a fix, and leaves the draft unchanged.
It explicitly avoids guessing whether AI wrote the text.

Start here when your draft already has a voice you want to keep.
Review its banned vocabulary before using it with an established style guide.
Its edit workflow also needs the bundled evaluation file.

Run No AI Slop:

`npx skilld run petergyang/no-ai-slop/no-ai-slop`

A remote run prints instructions. It does not install supporting files.
If your Agent needs the evaluation file on disk, inspect the source and install the Skill as an opt-in step.

With skilld 3.3.0, hosted repository-root Skills are rejected.
Humanizer and Stop Slop use root paths, so this page links their pinned sources without printing run commands.

## How the three Skills differ

On small screens, scroll the table sideways to read every column.

::div{.comparison-table tabindex="0" role="region" aria-label="Humanizer, Stop Slop, and No AI Slop comparison"}
| Decision | [Humanizer, blader/humanizer](https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md) | [Stop Slop, hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md) | [No AI Slop, petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md) |
| --- | --- | --- | --- |
| Editing workflow | Mark patterns, draft, check facts and surviving patterns, then write the final version. | Apply eight core rules, run quick checks, and revise against its style rubric. | Make the minimum effective edit, then check the draft against its evaluation file. |
| Voice and structure | A supplied voice sample overrides pattern rules. Structural changes are allowed. | Enforces active voice and strict adverb rules. Its main instructions provide no voice-sample override. | Keeps vocabulary, cadence, bluntness, and useful detours. Keeps structure unless it hurts the piece. |
| Factual meaning | Explicitly checks added or lost facts, numbers, quotes, citations, and conditions. | Emphasizes specificity. Its main instructions provide no equivalent fact-preservation checklist. | Prohibits invented claims, examples, stats, and opinions. Asks when meaning is unclear. |
| Output | Pasted-text mode returns a draft, remaining patterns, and final rewrite. File mode writes only final prose. | Its main instructions define checks and a score, without a dedicated findings-only mode. | Edit mode returns the draft and changes. Detect mode quotes findings without rewriting or scoring. |
| Supporting files | The main instructions contain its pattern guide and examples. | Links phrase, structure, and example reference files. | Edit mode requires the bundled evaluation file. |
| Main tradeoff | Intermediate output can be lengthy. Structure changes need a careful meaning check. | Blanket adverb and passive-voice rules can conflict with deliberate style or technical precision. | Some vocabulary is banned outright, while its blunt register still needs to fit the audience. |
::

## Two alternatives with a distinct purpose

The wider review found useful options beyond the three starred Repositories.
These two address a narrower editing requirement:

### anti-slop for preserving paragraph structure

::comparison-skill-card
---
owner: "elithrar"
repo: "dotfiles"
name: "anti-slop"
to: "/gh/elithrar/dotfiles/anti-slop"
source: "https://github.com/elithrar/dotfiles/blob/4b38887ec969bbc1c97c1434732fac97ea7ff0dd/.agents/skills/anti-slop/SKILL.md"
description: "Preserves paragraph structure unless you request a broader rewrite."
---
::

### deslop-writing for technical documentation

::comparison-skill-card
---
owner: "kmaida"
repo: "deslop-skills"
name: "deslop-writing"
to: "/gh/kmaida/deslop-skills/deslop-writing"
source: "https://github.com/kmaida/deslop-skills/blob/70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b/deslop-writing/SKILL.md"
description: "Technical documentation guidance with a required banned-word reference."
---
::

For other workflows and language-specific choices, browse [writing Skills](/skills/anti-slop).

## Check each candidate on the same draft

Give candidates the same input, audience, and voice sample.
Ask each to preserve every fact, condition, number, quote, citation, and link.
Ask it to flag missing evidence and return the rewrite with material changes.

Compare each result with the original.
Check that conditions and citations survive, no new facts appear, and commands remain intact.
Then read it for the intended audience and voice.
This is a suggested evaluation method, without a reported test result.

## Selection, sources, and disclosure

Reviewed on 5 October 2026 from the pinned sources linked above.

An agent assisted Harlan Wilton with research and drafting. Brundlefly shares a maintainer with skilld and informed the review method, without receiving placement.
