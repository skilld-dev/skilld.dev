# Example replay evidence

Observed 2026-10-05 against article parent commit `b2ad27337190367aaefe18d0c1169af948fa8b4e`.
The example's Skill body is unchanged by the content-refresh corrections.
These trials test the article example, not generation by the maintainer authoring Skills.

## Starting state

Create an isolated scratch project. Copy the article's complete fenced `SKILL.md` into:

- `.claude/skills/review-release-notes/SKILL.md`
- `.agents/skills/review-release-notes/SKILL.md`

Use the same bytes for both copies. No other project Skill was present.
Existing user configuration remained available. No model override was supplied.
Codex was 0.160.0, configured model `gpt-6.1-sol`, reasoning effort `medium`.
Claude Code was 2.1.288. Initialization reported `claude-opus-5-5`.
Gemini CLI was 0.54.0. It failed before a model was observed.
Account limits may prevent another operator from reproducing model execution.

## Explicit and matching input

Save this as `input.txt` in the scratch project:

```text
Use review-release-notes to check these notes against this diff.
Diff for config.ts:
+ export const timeoutMs = 5000
Draft release notes:
The new timeout defaults to 10 seconds.
```

From that project, run:

```sh
timeout 120 codex exec --json --sandbox read-only --skip-git-repo-check - < input.txt > explicit.ndjson 2> explicit.err
```

For a separate matching trial, replace only the first line with:
`Check these release notes against this diff.`
Run the same command in a fresh process, using separate output files.

Both observed traces read `.agents/skills/review-release-notes/SKILL.md` with exit code 0.
Both identified 5 seconds rather than 10 seconds and qualified the unsupported default claim.
Sanitized explicit result: “Added a timeout setting of 5 seconds.”
Sanitized matching result: “The timeout is set to 5 seconds.”
These are local observations, not fixed model outputs or universal selection guarantees.

## Missing input and unrelated task

Run each command separately from the same scratch project. Do not resume an earlier session.

```sh
timeout 120 codex exec --json --sandbox read-only --skip-git-repo-check 'Use review-release-notes to check these draft release notes: The new timeout defaults to 10 seconds.' > missing.ndjson 2> missing.err
timeout 120 codex exec --json --sandbox read-only --skip-git-repo-check 'Suggest three CSS background colors for a documentation site.' > unrelated.ndjson 2> unrelated.err
```

Missing input: the trace read the exact Skill, then requested the release diff before reviewing.
Sanitized result: “Please paste the release diff so I can verify the 10-second default.”
Unrelated task: the trace contained one response proposing CSS colors, with no Skill read or activation.
Neither observation establishes matching behavior for other prompts.

## Claude and Gemini attempts

From the same scratch project and explicit input:

```sh
timeout 120 claude -p --output-format stream-json --verbose --no-session-persistence --allowedTools Read Skill < input.txt > claude.ndjson 2> claude.err
timeout 120 gemini --prompt 'Use review-release-notes to check these notes against this diff. Diff for config.ts: + export const timeoutMs = 5000. Draft release notes: The new timeout defaults to 10 seconds.' --approval-mode plan --skip-trust --output-format stream-json > gemini.ndjson 2> gemini.err
```

Claude initialization listed `review-release-notes`. Its weekly usage limit blocked execution, with zero model tokens.
This establishes discovery only. It does not establish selection or task completion.
Gemini returned `IneligibleTierError`: this client was unsupported for the account's Gemini Code Assist tier.
This establishes no discovery or execution result. Do not generalize it into a Skill compatibility defect.
If Gemini requests activation, review and approve it before treating the full Skill as loaded.

Raw traces remain private in `~/scratch/portable-skills/`.
The sanitized observations and complete prompts above preserve the evidence needed for another replay.

## Content-refresh acceptance

Reviewers checked the article's file digest rather than treating a commit SHA as a content digest.
Accepted article SHA-256: `10c533da43a4196e022b2dfe174344088e713213ca1d0237ed300880d17ddd62`.
Independent article_review and brief_review accepted this digest and the corrections on 2026-10-05.
Cross-Agent task completion remains unresolved under claim P08.
