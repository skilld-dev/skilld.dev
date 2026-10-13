# D1 reliability

Keep read replication disabled for `skilld-db`.
Use this runbook to remove restoring replicas from production Skill reads.
Codex prepared this runbook for Harlan Wilton.

Cloudflare [case 02370111](https://www.support.cloudflare.com/s/case/500Nv00000mk4JZ) identified a replica restoration loop.
Replicas restore a snapshot while the primary continues writing.
A replica that cannot catch up disconnects and starts restoring again.
Reads waiting on that replica fail during this cycle.

Cloudflare attributed the October 5 and 7 internal errors to reads waiting on a restoring European replica.
Individual error references could not be mapped one-to-one to retained logs.
Engineering considers the October 9 storage timeout a separate event that coincided with primary restarts.

## Disable replication

Use `cf` with access to the configured Cloudflare account and `D1:Edit` permission.
Run these commands from the repository root.
Check the database name and account in the dry run before applying the change.

```sh
cf d1 get a5e53f35-f5e5-4987-8c67-c0175addc7cc
cf d1 edit a5e53f35-f5e5-4987-8c67-c0175addc7cc --read-replication-mode disabled --dry-run
cf d1 edit a5e53f35-f5e5-4987-8c67-c0175addc7cc --read-replication-mode disabled
cf d1 get a5e53f35-f5e5-4987-8c67-c0175addc7cc
```

The final response must name `skilld-db` and return `read_replication.mode: disabled`.
This changes database configuration without a Worker deployment or a schema migration.
Cloudflare support advises allowing up to 24 hours for existing replicas to stop processing requests.
A successful request during that interval does not prove replica retirement.

Without replication, D1 routes reads and writes to the primary.
Requests from Europe and the Americas may take longer because the primary is in Oceania.
See [Cloudflare's replication model](https://developers.cloudflare.com/d1/best-practices/read-replication/#primary-database-instance-vs-read-replicas).

## Check production reads

Use the existing page, redirect, and asset checks:

```sh
pnpm production:smoke
cf d1 query a5e53f35-f5e5-4987-8c67-c0175addc7cc --sql "SELECT owner, repo, name FROM skills WHERE owner = 'anthropics' AND repo = 'skills' AND name = 'skill-creator' LIMIT 1"
```

The smoke result must return `_tag: passed`.
The query must return the Skill with `success: true` and `meta.served_by_primary: true`.
The REST query checks the primary directly; it does not prove where Worker session reads ran.

After the retirement interval, inspect Sentry for new internal errors and replica-disconnection errors.
Keep primary storage timeouts separate when comparing recurrences.
If errors continue, give Cloudflare the UTC timestamps, deployed release, and full error cause.

## Preserve session consistency

Keep the request sessions and bookmark cookie in [`server/utils/db.ts`](../../server/utils/db.ts).
Disabling replication keeps those constraints valid while D1 serves queries from the primary.
`first-primary` directs only the first query to the primary; later session queries can use replicas when replication is enabled.
See [D1 session constraints](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession).

D1 automatically retries eligible read-only queries up to twice.
Cloudflare support specifies a 45-second retry budget and excludes overloaded failures from those automatic retries.
The reported lifecycle failures lasted approximately 47 to 93 seconds, exceeding that budget.
See [D1 automatic retries](https://developers.cloudflare.com/d1/observability/debug-d1/#automatic-retries).

Application retries must preserve bookmarks and the request deadline, with bounded exponential backoff and jitter.
Retry only genuinely read-only queries, or writes whose idempotency has been established.
Keep replication disabled unless Cloudflare confirms the restoration loop is fixed and regional reads pass checks.
