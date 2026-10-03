# Default Skills directory

The default `/skills` list shows individual maintainers whose repositories primarily publish original Agent Skills.
General software, awesome lists, agent tools, mirrors, and incidental development instructions stay searchable.
Explicit search, maintainer, and tag filters bypass this browse screen.

This screen controls placement only. It does not grant trust, human approval, or search indexing.
Jev evaluates repository purpose from the synced description and Skill paths.
A probability of at least 0.8 qualifies. Missing or uncertain decisions stay outside the default list.
Human-rejected repositories stay outside this browse even when Jev finds them focused.
GitHub organizations stay outside this maintainer list.

## Refresh the screen

Export these public fields from D1 as a JSON array:

```sql
SELECT r.owner, r.repo, r.description, o.kind,
       group_concat(s.rendered_skill_path) AS paths
FROM repos r
JOIN skills s ON s.owner = r.owner AND s.repo = r.repo
LEFT JOIN owners o ON o.owner = r.owner
WHERE s.source_resolved = 1
GROUP BY r.owner, r.repo;
```

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with Workers AI Read access.
Keep credentials outside the repository.

```sh
pnpm exec tsx scripts/classify-skills-directory.ts INPUT.json OUTPUT.sql
```

The script screens every exported repository. It saves a resumable journal beside the output.
Failed requests stop the run. Resume with the same paths after fixing the failure.
For a fresh screen, use a new output path.

Review the SQL and qualifying repositories before placing the SQL in a new D1 migration.
Use the production deployment workflow to apply that migration.
Stored evidence, model version, probability, and evaluation time make each decision reconstructible.
Reclassify a repository with the same script when its purpose changes.
New repositories remain searchable until the next screen.

## Cull a repository

Set its `skill_repo_focus.probability` to zero through a reviewed migration.
Keep the evidence and reason for the correction in `evidence`.
Do not alter `skill_repo_eligibility` or trust overrides for a browse placement change.
