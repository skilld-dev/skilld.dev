# Description reviews

Jev reads description selection guidance without using character counts as a quality rule.
This research covers resolved source descriptions, including Skills outside search indexing.
Production abstractness classification still reads complete SKILL.md sources through its existing pipeline.

## Evidence

The review asks four literal questions: concrete task, selection situation, bounded scope, and substantial filler.
Task statements can imply when to use a Skill. Explicit trigger phrases are optional.
Specific examples, dependencies, and exclusions can be useful even in long descriptions.

- `clear`: task, activation, and scope probabilities are at least 0.8; filler probability is at most 0.2.
- `needs-work`: one required probability is at most 0.2, or filler probability is at least 0.8.
- `uncertain`: all other combinations.

These bands are research rules. They are not measured Agent selection failure rates.
The description's declared task dependence and topic receive separate Choice questions.
These answers do not replace source-based abstractness or repository-purpose findings.
Choice labels require selected-option probability of at least 0.8. Other answers remain `unclear`.
No review changes source admission, trust, indexability, or search ranking.

## Run

Export the author's description, owner, repo, name, current blob SHA, source commit, and raw SHA-256.
Use the source frontmatter description. Never substitute the repository description.
Input names are `description`, `owner`, `repo`, `name`, `sourceBlobSha`, `sourceCommit`, and `rawSha256`.

```sh
pnpm exec tsx scripts/review-skill-descriptions.ts INPUT.json OUTPUT.sql --concurrency 8 --max-cost 2
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with Workers AI permissions before running.
The tool uses Jev's direct HTTP client. It does not load repository `.env` files.
It sends only descriptions and fixed criteria to Jev.
Each batch contains 200 requests. The client uses explicit credentials and disables hidden retries.
Requests start at most four times per second by default. Set `--requests-per-second` to change this ceiling.
HTTP 429 responses receive two retries, each after a visible 30-second pause.
Other failures do not retry within a run.
Failed requests remain visible and retry on a later run.
Three provider failures stop dispatch of later batches.
The cost guard uses a conservative byte ceiling plus framing headroom at the published input rate.
It is not a billing cap. Provider retries, price changes, and other account work can change charges.
Token usage and estimated input cost appear in the completion output.
Confirm [current model pricing](https://developers.cloudflare.com/ai/models/typesafe/jev/) before changing the rate.

`OUTPUT.sql.jsonl` holds complete model responses and their review keys.
The key includes the exact description, model version, rubric version, and questions.
Identical descriptions reuse the same assessment. Changed descriptions require new assessments.
The tool checkpoints SQL after each batch and at completion.
Failed requests appear in `OUTPUT.sql.failures.jsonl`; the process exits with code 1.
Keep these files outside the repository.

## Persist

Apply a completed or copied checkpoint through the existing D1 command:

```sh
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file OUTPUT.sql
```

Findings live in `skill_generated`, using `description-review:<rubric-version>:<raw-sha256>` kinds.
The existing JSON payload supports these fields. No schema migration is required.
Each rubric and source version retains a separate row. Replaying SQL preserves the earlier finding.
Writes require matching identity, blob SHA, raw SHA-256, and the exact author description.
Evidence can match the successful current render or a retained source snapshot in `skill_description_history`.
Historical findings keep their original blob SHA. Current-source queries exclude them after a source change.
Unknown source versions are skipped. Re-export changed sources to review their new descriptions.

The payload preserves description, source hashes, source commit, questions, probabilities, labels, model, and usage.
`reviewKey` identifies the shared request for duplicate descriptions.
Count unique review keys when estimating cost. Summing each Skill row counts cached requests again.

```sql
SELECT json_extract(g.payload,'$.label') AS label,COUNT(*) AS skills
FROM skill_generated g JOIN skills s USING(owner,repo,name)
WHERE g.kind LIKE 'description-review:%'
  AND g.sha=s.current_sha
  AND json_extract(g.payload,'$.rawSha256')=s.rendered_raw_sha256
  AND json_extract(g.payload,'$.promptVersion')='2026-10-09-v1'
GROUP BY label;
```

Prefer an explicit rubric version for analysis. Grouping all versions can count a Skill repeatedly.
Use `skill_description_history` to join prior source snapshots when examining changes over time.
