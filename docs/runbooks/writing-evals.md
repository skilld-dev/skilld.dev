# Writing evaluations

Run from a task worktree:

```sh
pnpm exec tsx scripts/eval-writing.ts --out ~/scratch/writing-evals-YYYYMMDD --model zai-coding-plan/glm-5.3
```

The runner generates three AI-sounding Markdown documents about the fictional Margin app and package.
The existing document fixtures supply the facts, code, and links.
It generates one rewrite without a Skill, then one rewrite for each known writing Skill.
Every rewrite receives the same original documents and task prompt.
Each OpenCode run uses a fresh project, isolated home, and disabled tools.
The runner disables global Skills, external plugins, sharing, and automatic updates.
Provider credentials pass through memory and never enter the output files.
[OpenCode permissions](https://opencode.ai/docs/permissions/) define the tool controls.

Each Skill comes from its registry source commit.
The snapshot includes its Markdown files and bundled Markdown references.
The runner injects these instructions into the prompt, rather than testing Skill discovery.
It uses the published Brundlefly Skill. It never reads the local package's uncommitted changes.

The output directory keeps prompts, raw event transcripts, final Markdown, and source hashes.
`results.json` stores original, baseline, and Skill output for each file.
The runner resumes completed runs only when their prompt, model, and OpenCode version match.
If a run returns malformed JSON, an error, or tool activity, it fails.

## Read the results

Exact material checks find removed or changed code blocks, inline identifiers, commands, and URLs.
These checks do not prove factual completeness, natural writing, or authorship.
Read every document for invented claims, lost conditions, and changes to meaning.
Compare the baseline with the Skill output before making claims about improvement.
One run per Skill is a demonstration, not a stable quality ranking.
All outputs remain machine-generated and must keep that disclosure.

## Publish a reviewed run

Review `results.json` and the Markdown files first.
Keep seed and baseline identical across the six records.
Use the recorded model, OpenCode version, source commit, date, and exact rewrite prompt.
Add the documents to the existing demo manifest with `makes: writing` and an empty `shots` array.
Keep provenance in the evaluation record and open a pull request.
The normal production workflow publishes the approved records after merge.
