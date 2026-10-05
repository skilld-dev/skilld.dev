---
title: "Humanize writing Skills compared"
description: "Compare 18 prose editing Skills by workflow, voice preservation, language, and required files. Read the source, then run one."
label: "Source review · 5 October 2026"
command: "npx skilld run eyriecommander/codex-skills/humanize-writing"
targetQuery: "humanize writing skills comparison"
reviewedAt: "2026-10-05"
reviewDueAt: "2027-01-05"
scope: "18 public prose editing Skills discovered with skilld. Code cleanup and translation Skills are excluded."
methodology: "source-review"
disclosure: "An agent prepared this comparison for skilld. Brundlefly shares a maintainer with skilld and informed the review method. It receives no placement."
sources:
  - selector: blader/humanizer/humanizer
    revision: 225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8
    url: https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md
  - selector: aashaexo/soundshuman/soundshuman
    revision: a45cfbba9fde843d670e553a0aa98f6a23d7fb28
    url: https://github.com/aashaexo/soundshuman/blob/a45cfbba9fde843d670e553a0aa98f6a23d7fb28/SKILL.md
  - selector: richtabor/agent-skills/humanize
    revision: 89eb2e97fdde10396972ad38200a57afffd11226
    url: https://github.com/richtabor/agent-skills/blob/89eb2e97fdde10396972ad38200a57afffd11226/skills/humanize/SKILL.md
  - selector: aktsmm/agent-skills/humanize-writing
    revision: 6509c0f48bced64f71fa4c6488bef54999273d3c
    url: https://github.com/aktsmm/agent-skills/blob/6509c0f48bced64f71fa4c6488bef54999273d3c/humanize-writing/SKILL.md
  - selector: eyriecommander/codex-skills/humanize-writing
    revision: e2bf5bdf9eaa9f234247aa4078a3a252497efd9b
    url: https://github.com/eyriecommander/codex-skills/blob/e2bf5bdf9eaa9f234247aa4078a3a252497efd9b/skills/humanize-writing/SKILL.md
  - selector: daleseo/korean-skills/humanizer
    revision: ae12ba27982ebeff03b46dc738365aaa34260d9a
    url: https://github.com/daleseo/korean-skills/blob/ae12ba27982ebeff03b46dc738365aaa34260d9a/skills/humanizer/SKILL.md
  - selector: humanizer-tools/slop-humanizer/slop-humanizer
    revision: 07975db781e67863098ec22f95730aa79795d627
    url: https://github.com/humanizer-tools/slop-humanizer/blob/07975db781e67863098ec22f95730aa79795d627/SKILL.md
  - selector: mgonto/executive-assistant-skills/humanizer
    revision: 28f5065274b43360d7f564f5833c97f9377d3313
    url: https://github.com/mgonto/executive-assistant-skills/blob/28f5065274b43360d7f564f5833c97f9377d3313/humanizer/SKILL.md
  - selector: kmaida/deslop-skills/deslop-writing
    revision: 70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b
    url: https://github.com/kmaida/deslop-skills/blob/70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b/deslop-writing/SKILL.md
  - selector: av/skills/catalog-deslop
    revision: 7fb0398999bc79ccb342e9d2e70f3f442feb26bb
    url: https://github.com/av/skills/blob/7fb0398999bc79ccb342e9d2e70f3f442feb26bb/catalog-deslop/SKILL.md
  - selector: yawbtng/skills/deslop
    revision: b78f3ba20f49c0ad8546324598b055232eb305ae
    url: https://github.com/yawbtng/skills/blob/b78f3ba20f49c0ad8546324598b055232eb305ae/skills/deslop/SKILL.md
  - selector: nielsmadan/agentic-coding/deslop
    revision: 21c84ea2ba8eea7f55f4d41a64b5f6ae68baf337
    url: https://github.com/nielsmadan/agentic-coding/blob/21c84ea2ba8eea7f55f4d41a64b5f6ae68baf337/loadout/skills/deslop/SKILL.md
  - selector: 0xsunseeker/ai-deslop/ai-deslop
    revision: 97bcfa5628033bf5a48f9bdeb8c5b8258df09be1
    url: https://github.com/0xsunseeker/ai-deslop/blob/97bcfa5628033bf5a48f9bdeb8c5b8258df09be1/SKILL.md
  - selector: jaysi88/deslop/deslop
    revision: 7b07e0e5bd576c687d7e221bd9f06d40fa36e3d0
    url: https://github.com/jaysi88/deslop/blob/7b07e0e5bd576c687d7e221bd9f06d40fa36e3d0/skills/deslop/SKILL.md
  - selector: hardikpandya/stop-slop/stop-slop
    revision: 8da1f030185bdfe8471220585162991eaeb970e9
    url: https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md
  - selector: elithrar/dotfiles/anti-slop
    revision: 4b38887ec969bbc1c97c1434732fac97ea7ff0dd
    url: https://github.com/elithrar/dotfiles/blob/4b38887ec969bbc1c97c1434732fac97ea7ff0dd/.agents/skills/anti-slop/SKILL.md
  - selector: adenaufal/anti-slop-writing/english
    revision: 104fae8cf646d97cdf06fb9e5cc5f2a724808b1a
    url: https://github.com/adenaufal/anti-slop-writing/blob/104fae8cf646d97cdf06fb9e5cc5f2a724808b1a/english/SKILL.md
  - selector: petergyang/no-ai-slop/no-ai-slop
    revision: 000650b156983f5159695b441477f4e63b25dc85
    url: https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md
---

Start with **eyriecommander/humanize-writing** for a general prose edit that preserves facts, citations, and the intended voice.
Choose **elithrar/anti-slop** for a light edit that keeps paragraph structure.
For Japanese or Korean prose, use a language-specific Skill from the table below.

The useful difference is how each Skill handles voice, scope, and unsupported facts.
A longer pattern list does not establish better writing.

## Pick the editing workflow first

On small screens, scroll the tables sideways to read every column.

::div{.comparison-table tabindex="0" role="region" aria-label="Editing workflow choices"}
| Your draft needs | Read first | Why this fits |
| --- | --- | --- |
| A general edit with voice and citation boundaries | [eyriecommander/humanize-writing](https://github.com/eyriecommander/codex-skills/blob/e2bf5bdf9eaa9f234247aa4078a3a252497efd9b/skills/humanize-writing/SKILL.md) | It preserves factual meaning and reads additional references when the task needs them. |
| A general edit with a final integrity check | [blader/humanizer](https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md) | It checks both surviving patterns and added or lost claims. |
| Small phrasing changes | [elithrar/anti-slop](https://github.com/elithrar/dotfiles/blob/4b38887ec969bbc1c97c1434732fac97ea7ff0dd/.agents/skills/anti-slop/SKILL.md) | It preserves paragraph structure unless you request a broader rewrite. |
| A visible rubric and before/after score | [richtabor/humanize](https://github.com/richtabor/agent-skills/blob/89eb2e97fdde10396972ad38200a57afffd11226/skills/humanize/SKILL.md) | It scores writing patterns and checks coverage. |
| A docs-folder workflow | [aashaexo/soundshuman](https://github.com/aashaexo/soundshuman/blob/a45cfbba9fde843d670e553a0aa98f6a23d7fb28/SKILL.md) | It describes repository audit and file modes. Its declared name differs from this selector. |
| A catalog of edits with a regression gate | [av/catalog-deslop](https://github.com/av/skills/blob/7fb0398999bc79ccb342e9d2e70f3f442feb26bb/catalog-deslop/SKILL.md) | Each edit must trace to a finding. It requires scripts and subagents. |
| Japanese or Korean editing | [aktsmm/humanize-writing](https://github.com/aktsmm/agent-skills/blob/6509c0f48bced64f71fa4c6488bef54999273d3c/humanize-writing/SKILL.md) or [daleseo/humanizer](https://github.com/daleseo/korean-skills/blob/ae12ba27982ebeff03b46dc738365aaa34260d9a/skills/humanizer/SKILL.md) | Their instructions address language-specific writing patterns. |
::

These are recommendations from source review. We did not benchmark generated rewrites.
Scores inside individual Skills are their editorial rubrics, not comparable accuracy measurements.

skilld 3.3.0 rejects hosted Skills at a repository-root path.
For those Skills, use the linked source to review the instructions.
The run commands here use subdirectory Skills.

## General prose editors

All source links point to the exact commit reviewed on 5 October 2026.
Each row names its Repository. Similar names can hide different instructions.
Repository ownership does not establish authorship.

::div{.comparison-table tabindex="0" role="region" aria-label="General prose editors"}
| Skill and Repository | Choose it for | Tradeoff to check |
| --- | --- | --- |
| [humanizer, blader/humanizer](https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md) | A draft, audit, and final rewrite with voice samples. | Default pasted-text output includes intermediate work. File mode returns the final text. |
| [soundshuman, aashaexo/soundshuman](https://github.com/aashaexo/soundshuman/blob/a45cfbba9fde843d670e553a0aa98f6a23d7fb28/SKILL.md) | A broad pattern catalog and repository audit modes. | The reviewed frontmatter declares humanize rather than soundshuman. Check its identity before use. |
| [humanize, richtabor/agent-skills](https://github.com/richtabor/agent-skills/blob/89eb2e97fdde10396972ad38200a57afffd11226/skills/humanize/SKILL.md) | Categorized rules with before/after scoring. | Its score is a house rubric. It cannot establish authorship. |
| [humanize-writing, eyriecommander/codex-skills](https://github.com/eyriecommander/codex-skills/blob/e2bf5bdf9eaa9f234247aa4078a3a252497efd9b/skills/humanize-writing/SKILL.md) | Voice matching with citation and privacy boundaries. | It asks for references on sensitive or voice-matching tasks. |
| [anti-slop, elithrar/dotfiles](https://github.com/elithrar/dotfiles/blob/4b38887ec969bbc1c97c1434732fac97ea7ff0dd/.agents/skills/anti-slop/SKILL.md) | Minimal phrasing edits that keep the argument and structure. | It deliberately avoids broad restructuring unless requested. |
| [no-ai-slop, petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md) | A minimum edit, or findings without a rewrite. | Its blunt register still needs to fit your audience. |
::

Run the Skill that fits your draft:

- richtabor: `npx skilld run richtabor/agent-skills/humanize`
- eyriecommander: `npx skilld run eyriecommander/codex-skills/humanize-writing`
- elithrar: `npx skilld run elithrar/dotfiles/anti-slop`
- petergyang: `npx skilld run petergyang/no-ai-slop/no-ai-slop`

Soundshuman has no run command here because the reviewed source declares a different Skill name.

**The meaningful split:** elithrar preserves paragraph structure by default.
Blader permits structural changes, then checks for lost claims.
Choose based on the amount of editing you want, before comparing vocabulary lists.

## Style directives and checklist variants

::div{.comparison-table tabindex="0" role="region" aria-label="Style directives and checklist variants"}
| Skill and Repository | Choose it for | Tradeoff to check |
| --- | --- | --- |
| [stop-slop, hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop/blob/8da1f030185bdfe8471220585162991eaeb970e9/SKILL.md) | A compact directive against filler and formulaic structure. | Its strict adverb and passive-voice rules can conflict with a required register. |
| [deslop-writing, kmaida/deslop-skills](https://github.com/kmaida/deslop-skills/blob/70237e1ae0dfbf7bc9ab5e6e3de52c092586ca9b/deslop-writing/SKILL.md) | A broad writing directive with technical documentation guidance. | Its main instructions require a banned-word reference. Review your house style first. |
| [english, adenaufal/anti-slop-writing](https://github.com/adenaufal/anti-slop-writing/blob/104fae8cf646d97cdf06fb9e5cc5f2a724808b1a/english/SKILL.md) | English editing with vocabulary lists treated as prompts. | Its dated model coverage is separate from evidence about a draft. |
| [ai-deslop, 0xsunseeker/ai-deslop](https://github.com/0xsunseeker/ai-deslop/blob/97bcfa5628033bf5a48f9bdeb8c5b8258df09be1/SKILL.md) | A numbered 60-rule checklist with a verification pass. | Sentence and punctuation caps are prescriptive. Its voice exemption matters. |
| [deslop, yawbtng/skills](https://github.com/yawbtng/skills/blob/b78f3ba20f49c0ad8546324598b055232eb305ae/skills/deslop/SKILL.md) | Detect or edit modes with a rubric for edit intensity. | It requires several references. Keep their scores separate from output quality. |
| [slop-humanizer, humanizer-tools/slop-humanizer](https://github.com/humanizer-tools/slop-humanizer/blob/07975db781e67863098ec22f95730aa79795d627/SKILL.md) | A combined checklist drawn from several humanizer sources. | Shared lineage does not count as independent evidence that the rules work. |
| [humanizer, mgonto/executive-assistant-skills](https://github.com/mgonto/executive-assistant-skills/blob/28f5065274b43360d7f564f5833c97f9377d3313/humanizer/SKILL.md) | A Wikipedia-derived pattern list inside an assistant collection. | The source credits biostartechnology. Its example adds specific features and feedback absent from the input. |
::

- kmaida: `npx skilld run kmaida/deslop-skills/deslop-writing`
- adenaufal: `npx skilld run adenaufal/anti-slop-writing/english`
- yawbtng: `npx skilld run yawbtng/skills/deslop`
- mgonto: `npx skilld run mgonto/executive-assistant-skills/humanizer`

**One source-level warning:** mgonto's full example introduces batch processing, shortcuts, offline mode, and beta feedback.
The input provides none of those details.
That observation concerns the example, not every output from the Skill.
Require a fact-preservation check with any editor you choose.

## Workflows that depend on scripts

::div{.comparison-table tabindex="0" role="region" aria-label="Workflows that depend on scripts"}
| Skill and Repository | Choose it for | Extra requirements |
| --- | --- | --- |
| [catalog-deslop, av/skills](https://github.com/av/skills/blob/7fb0398999bc79ccb342e9d2e70f3f442feb26bb/catalog-deslop/SKILL.md) | An existing draft with traceable findings and a regression gate. | Shell and Python checks, catalog subagents, fix subagents, and a cold verifier. |
| [deslop, nielsmadan/agentic-coding](https://github.com/nielsmadan/agentic-coding/blob/21c84ea2ba8eea7f55f4d41a64b5f6ae68baf337/loadout/skills/deslop/SKILL.md) | Prose files with report mode and code masking. | Its detector uses Python. The instructions allow manual review for short pasted passages. |
| [deslop, jaysi88/deslop](https://github.com/jaysi88/deslop/blob/7b07e0e5bd576c687d7e221bd9f06d40fa36e3d0/skills/deslop/SKILL.md) | Product copy and generic visual cues in a repository. | Its Node scanner uses a repository-relative path. Check the copied directory layout. |
::

- av: `npx skilld run av/skills/catalog-deslop`
- nielsmadan: `npx skilld run nielsmadan/agentic-coding/deslop`
- jaysi88: `npx skilld run jaysi88/deslop/deslop`

A remote run prints instructions. It does not install scripts.
If the workflow needs an executable file, inspect the source and install the Skill before running that file.
Keep installing as the opt-in step for a workflow you want to retain.

## Japanese and Korean need their own comparison

::div{.comparison-table tabindex="0" role="region" aria-label="Japanese and Korean editing"}
| Skill and Repository | Language and workflow | Tradeoff to check |
| --- | --- | --- |
| [humanize-writing, aktsmm/agent-skills](https://github.com/aktsmm/agent-skills/blob/6509c0f48bced64f71fa4c6488bef54999273d3c/humanize-writing/SKILL.md) | Japanese and English audit, rewrite, or generation instructions. | Its metrics workflow uses Python. The source declares CC BY-NC-SA 4.0. |
| [humanizer, daleseo/korean-skills](https://github.com/daleseo/korean-skills/blob/ae12ba27982ebeff03b46dc738365aaa34260d9a/skills/humanizer/SKILL.md) | Korean-only editing with language-specific patterns and severity levels. | The research metrics cited in the source do not measure this Skill's rewrite quality. |
::

- aktsmm: `npx skilld run aktsmm/agent-skills/humanize-writing`
- daleseo: `npx skilld run daleseo/korean-skills/humanizer`

Aktsmm checks conditions, numbers, and constraints after editing.
It also distinguishes deliberate voice from a cluster of repeated patterns.
Daleseo addresses Korean spacing, punctuation, and translation-like phrasing.
An English punctuation checklist does not replace that language-specific work.

## Compare on one draft before keeping a Skill

Give two candidates the same input, audience, and voice sample.
Use this instruction with each:

> Edit this draft for clarity and natural voice. Preserve every fact, condition, number, quote, citation, and link.
> Keep deliberate voice. Flag missing evidence instead of adding detail. Return the rewrite and material changes.

Compare the result against the original:

- Check that every condition and citation survives.
- Check that no new fact appears.
- Check that commands and code remain intact.
- Read it aloud for your audience and voice.

This is a suggested evaluation method. It is not a reported test result.
Do not compare the candidates by their own numeric scores.
Use the same facts and voice criteria for both.

## Scope, sources, and disclosure

An agent prepared this source comparison for skilld.
Brundlefly shares a maintainer with skilld and informed the two-pass review method.
Brundlefly receives no placement in this comparison.

Discovery used the skilld search command with JSON output for humanize writing, deslop, stop-slop, and related names.
We read the public Skill source files at the commits linked above.
Hosted skilld run supplied instructions where Artifact delivery completed.
For other candidates, we read the pinned source through GitHub.
No remote Skill files were installed.

This page compares the instructions in 18 public Skills.
It excludes code cleanup Skills such as brianlovin/deslop and jaredpalmer/deslop.
It also excludes translation, academic-writing, and general writing Skills without a prose cleanup focus.
Search results are a discovery sample, not an exhaustive census.

The review covers declared workflows, output formats, language, and required files.
It does not establish detector evasion, authorship, safety, or measured editing quality.
Source revisions can change. The next source review is due on 5 January 2027.

For broader discovery, browse [writing Skills](/skills/writing).
