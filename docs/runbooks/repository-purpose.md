# Repository purpose

Jev reads repository purpose from bounded source evidence at one Git commit.
The stored finding covers organizations and individual maintainers.
It records directories, mirrors, original Skill packs, software, and uncertain evidence separately.

## Read a finding

```sql
SELECT owner,repo,purpose,probability,reason,model,source_commit,prompt_version,evaluated_at
FROM repository_purpose
WHERE owner='posthog' AND repo='posthog';
```

The `evidence` column holds description, README excerpt, path samples, Skill excerpts, and measured counts.
Counts are null when GitHub truncates the tree. A partial tree never proves a full count.
The `answer` column preserves the typed model answer and option probabilities.
The reason comes from the selected criterion or an explicit uncertainty rule. Jev does not generate prose.

## Admission

New directory, mirror, and uncertain findings require human review before the ingestion reads all Skill contents.
Existing Skills, eligible human decisions, named positive trust overrides, and verified Owners retain the existing admission path.
Software and Skill-pack findings continue through the existing rules. They earn no new trust or SEO indexing.
The leaderboard review surface covers individual Owners with discovered inventory.
Use the query below for held findings outside that surface, including organizations and new submissions.
Do not edit a machine finding as approval.

```sql
SELECT p.owner,p.repo,p.purpose,p.reason,p.evidence,p.source_commit
FROM repository_purpose p
WHERE p.purpose IN ('directory','mirror','uncertain')
  AND NOT EXISTS(SELECT 1 FROM skills s WHERE s.owner=p.owner AND s.repo=p.repo)
  AND NOT EXISTS(SELECT 1 FROM skill_repo_eligibility e
    WHERE e.owner=p.owner AND e.repo=p.repo AND e.status='eligible')
  AND NOT EXISTS(SELECT 1 FROM repo_trust_overrides t
    WHERE t.owner=p.owner AND t.repo=p.repo
      AND t.tier IN ('official','trusted-author','trusted-curator')
      AND length(trim(t.reviewed_by))>0 AND length(trim(t.reason))>0)
ORDER BY p.evaluated_at;
```

If a human approves source admission, record an existing positive `repo_trust_overrides` decision through a reviewed migration.
Set the actual reviewer, reason, source, and review time. This decision permits source admission for the whole Repository.
Use `trusted-curator` only when the human approves that trust level. Keep rejected findings held.
After the migration deploys, submit the Repository again through the search box or `POST /api/repos/index`.
The new job checks the human decision before calling Jev. The decision never changes the machine finding.

The default Skills directory retains its separate `skill_repo_focus` screen.
Repository purpose does not replace that screen or the `repo_kind` field.

## Refresh

The hourly task dispatches up to 25 durable classification jobs.
It prioritizes truncated trees, large Skill inventories, and repositories with stored Skills.
It includes metadata-only repositories with detected Skills, including held large inventories.
The task avoids active jobs and waits one day after a failed job.

A changed source commit or prompt version invalidates the cached model answer.
Findings expire after seven days, so an unchanged source still receives periodic model checks.
The source reader uses one recursive tree request. It never expands a truncated tree.
It streams bounded prefixes from the README and two representative Skills at the same source commit.
Provider or source failures retry through the durable queue. Missing purpose evidence records `uncertain`.
An uncertain result never becomes permission to admit a repository.

## Evaluate a prompt

Prepare a JSON array with `name`, `expected`, and `evidence` for each case.
The evaluator parses each evidence object against the same source limits.
Use public source snapshots and keep reports outside the repository.

```sh
pnpm exec tsx scripts/evaluate-repository-purpose.ts INPUT.json OUTPUT.json
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with Workers AI Read access.
Or pass `--binding` to use Wrangler's authenticated remote Workers AI binding.
The evaluator records answers and source evidence. It writes no database rows.
Include a large application, small directory, original Skill pack, mirror, single root Skill, and uncertain evidence.
Include source text that tries to instruct the model. Check that it stays evidence.
If a prompt changes, update `REPOSITORY_PURPOSE_PROMPT_VERSION` and repeat the eval before delivery.

## Cull

A machine finding never removes existing Skills.
Use existing human admission and Skill indexability procedures to remove an unsuitable surface.
Keep the human reason separate from the machine evidence.
