# Description evidence

Use author frontmatter for description research. `skills.description` can contain repository fallback text.
The current snapshot is `skills.rendered_frontmatter`. Its source identity includes the content hash and source commit.

`skill_description_history` preserves complete snapshots across refreshes.
Each content hash has one row per Skill identity, with first and last observation times.
The stored frontmatter includes missing descriptions and invocation settings.
Repository moves carry the history to the new identity. Removing a source retains its observations.

The migration backfills complete current snapshots. It cannot recover overwritten versions.
The production deployment workflow applies the migration before deploying code.
Database triggers capture later snapshots inside the existing write transaction.
Incomplete snapshots and malformed frontmatter never enter the history.
Repeated content extends observation times without adding another row.

## Current source sample

```sql
SELECT s.owner, s.repo, s.name, s.rendered_frontmatter,
       s.current_sha, s.rendered_commit_sha, s.rendered_raw_sha256,
       s.rendered_skill_path, s.last_synced_at
FROM skills s
WHERE s.source_resolved=1 AND s.rendered_status='ok'
  AND json_valid(s.rendered_frontmatter);
```

Count missing, non-string, and blank descriptions before excluding them.
Measure decoded Unicode characters and UTF-8 bytes separately.
Record the export time and checksum. Keep source identities beside every result.

## Description changes

```sql
SELECT owner, repo, name, raw_sha256, source_blob_sha, source_commit,
       source_path, first_observed_at, last_observed_at,
       json_type(frontmatter, '$.description') AS description_type,
       json_extract(frontmatter, '$.description') AS description
FROM skill_description_history
ORDER BY owner, repo, name, first_observed_at;
```

A content version can change without changing its description. Compare decoded descriptions before counting description edits.
Source commits may be absent in legacy snapshots. Exclude those rows when requiring exact commit attribution.

## Classification controls

The older `skill_repo_focus` screen covers individual maintainers only.
Organization rows with model `owner-kind` were excluded by ownership, without a Jev purpose judgment.
Use `model LIKE 'jev%' AND probability>=0.8` for its positive group.

The newer `repository_purpose` classifier distinguishes Skill publishing, software, directories, mirrors, and uncertainty.
Report its missing and uncertain rows separately. Do not treat either as a negative finding.
Require `repository_purpose.source_commit=skills.rendered_commit_sha` for same-commit comparisons.

Skill classifications live in `skill_generated` with kind `abstractness`.
Require `skill_generated.sha=skills.current_sha` before using their payload.
Its `abstract` value means general-purpose. Its `package-specific` value identifies package knowledge.
These classifications are machine evidence. They do not establish quality or human approval.

## Interpretation limits

Report Skill-weighted results and the median of repository medians.
Repeat results after removing duplicate descriptions. Show collection coverage against its source inventory.
Our registry admission rules create a selected sample. It is not the skills.sh top 10,000.

Description length measures context cost. It does not establish routing quality.
Phrase matching measures visible markers, not whether a model understands a trigger.
Synthetic catalogs must name their renderer assumptions, budget, sampling seed, and missing policy metadata.
Agent version, invocation policy, enabled Skills, and actual prompt captures require separate runtime evidence.

The skills.sh crawler records dated ranks and install estimates.
Check observation dates before using those values. `skills.installs` is not a fresh ranking snapshot.
