# Production pipeline triage, 2026-07-23

## Verdict: AMBER

The public site is healthy, no repos became newly broken in the 24-hour window, and all eight instrumented application tasks are fresh. The pipeline still has material silent-loss paths:

1. Vectorize is missing 346 eligible skills. D1 claims 344 of them have current embeddings, so the normal worker will not repair them.
2. New skills inside known repos are being found, but new-repo discovery is not an autonomous production pipeline. The scheduler ignores 5,295 unbroken repo candidates that claim skill files but have no admitted skill rows.
3. [GitHub](https://github.com) sync commits `last_tree_sha` before blob processing succeeds. One partial blob response can quarantine skills and suppress the retry permanently.
4. A weekly digest subscriber has no deliverable address. The task skips the user before it can write a failure, leaving 1,076 unseen activity rows at gather time, 1,089 on a later rerun, with no alert.
5. The migration ledger says all 69 migrations ran, but `install_events` and two migration indexes are absent. Production data cannot report installs. [Sentry](https://sentry.io) issue reads also return HTTP 403, leaving one `exceededMemory` outcome unattributed.

AMBER is appropriate because these are real data and discovery defects, not a current front-door outage. Missing Vectorize entries reduce semantic recall for about 12.8% of eligible skills.

## Scope and method

Window: `2026-07-22T00:41:00.087Z` through `2026-07-23T00:41:00.087Z`.

All production actions were read-only. The daily gatherer ran without `--save`. D1 inspection used `wrangler d1 execute ... --remote --command 'SELECT ...'`, `PRAGMA` reads, and `EXPLAIN QUERY PLAN`. Vectorize inspection used `wrangler vectorize info` and `wrangler vectorize list-vectors`. [Cloudflare](https://cloudflare.com), GitHub Actions, and Sentry were queried without changing state. No migration, retry, deployment, D1 write, Sentry change, or source-code edit was made. This report is the only file created.

The gatherer captured an old deployment while a deployment was finishing. Production migration `0069` was applied at `2026-07-23 00:38:46`; deployment version `5f018...`, commit `e2c45`, completed at `00:41:08Z`; schedules changed at `00:41:10Z`. The post-deploy schema and schedules are used below.

Some throughput values cannot be recovered exactly. `skill_revisions` and `activity` store source event time but no insertion time. `sync_jobs` stores only the most recent completion. AI-ready run logging is disabled. These gaps are reported as unknown rather than inferred from event timestamps.

## Compact pipeline map

```text
GitHub search/manual scan
  -> repos
  -> only repos already containing an admitted skill enter sync-github-skills hourly
  -> skills + skill_revisions + activity
  -> skill_dirty -> drain-skill-dirty every 5 minutes + full daily
  -> skills.rendered_* -> reconcile-rendered every 6 hours + cold page repair
  -> ai_batch_* + skill_generated
       -> Anthropic batches hourly poll/submit, summary/tags/faq paused
       -> Workers AI abstractness + embedding hourly
       -> Vectorize skill-embeddings
  -> nuxt-ai-ready pages/FTS -> IndexNow every 5 minutes
  -> skill_subscriptions + activity -> digest_runs hourly -> email

Every app task -> sync_jobs latest-state reporter
nuxt-ai-ready cron -> ai_ready_cron_runs only when debug enabled, currently disabled
nuxt-cf-jobs -> jobs/failed_jobs infrastructure, currently unused
```

## Findings ranked by user impact

| Rank | Severity | Finding | Evidence | User effect |
|---:|:---:|---|---|---|
| 1 | High | Vectorize and D1 disagree | 346 eligible skills lack vectors; 344 have a current D1 embedding marker; 639 vectors have no current skill | Semantic search silently omits current skills and retains stale vectors |
| 2 | High | Organic new-repo discovery is incomplete | Hourly sync requires an existing skill row; 7,067 repos have none, including 5,295 unbroken repos whose `repo_skill_count` says skill files exist | Most discovered candidates cannot enter the live pipeline or be reconsidered |
| 3 | High | GitHub sync can acknowledge incomplete work | `repos.last_tree_sha` is updated before blob parsing; missing blobs are skipped; the next run sees the committed SHA | Content changes can disappear until another tree change or manual repair |
| 4 | High | Digest subscriber is silently undeliverable | One due-configured user has four subscriptions, no recipient, no run row, and 1,076 pending activity events at gather time, aged 62.31 days | The user never receives a digest and operators see no failure |
| 5 | High | Scoring updates use an incomplete identity | Update predicates and curator subqueries use owner and name, omitting repo; 24 duplicate owner/name groups contain 48 rows | Scores and indexability can bleed across repos |
| 6 | High | Broken repos can remain indexable | 116 skills on broken repos are `source_resolved=1` and indexable; recomputation ignores broken state and persisted resolution | Search can expose stale or unavailable skills |
| 7 | Medium | Migration ledger and objects disagree | `0068_cf_jobs.sql` and all prior migrations are recorded; `install_events`, its three indexes, and `idx_repo_trust_overrides_tier` are absent | Install analytics are unavailable; deploy confidence is false |
| 8 | Medium | IndexNow scans the whole page inventory | Planner reads 143,310 rows in 1,235.8 ms to find 11 pending rows; forced partial index reads 11 rows in 0.151 ms | About 41.3 million avoidable row reads per day before other IndexNow queries |
| 9 | Medium | Render backlog has no repair route | 44 active skills have no rendered payload; 39 measurable items have p50 age 81.53 days; reconcile only selects explicit failure states | Some skill pages depend on opportunistic cold repair |
| 10 | Medium | AI work repeats while generation is paused | 1,126 eligible skills lack current AI metadata; submit still recomputes embedding and abstractness for up to 50 selected skills hourly | Avoidable Workers AI, Vectorize, and D1 work; costs are not recorded |
| 11 | Medium | Production error visibility is incomplete | Sentry token returns 403; one Worker `exceededMemory` at `2026-07-22T13:00:52Z`; no task history links it to a task | Failures can pass without a diagnosis or alert |
| 12 | Medium | Failed digest windows are treated as consumed | Cursor uses maximum `window_end` regardless of status | A future email failure will not retry the missed window |
| 13 | Low | Historical tables contain extensive stale data | 155,958 activity orphans, 63,860 duplicate activity rows beyond the first, 16 revision orphans, 7,257 repo skill-count mismatches | Storage and queries carry data with weak or false ownership |

## Stage ledger

Age is measured at `2026-07-23T00:41:00.087Z`. `n/a` means no pending row. `Unknown` means the schema cannot measure the value.

### 1. GitHub discovery and sync

| Item | Result |
|---|---|
| Input | GitHub code search for manual discovery; `repos`, `skill_subscriptions`, GitHub tree and blob APIs |
| Output | `repos`, then downstream `skills`, revisions, activity, and dirty rows |
| Trigger | Ecosystem-wide discovery has no scheduled trigger. Authenticated owners get a first-login background scan and a manual profile rescan. Sync task is `0 * * * *`; maximum 250 repos; concurrency 8; normal threshold 36 hours; subscribed threshold 1 hour |
| Volume | 7,363 repos; 296 contain skills, 274 of those are unbroken. 7,067 have no skills; all 7,067 report `repo_skill_count > 0`; 5,295 are unbroken |
| 24-hour throughput | 42 repo checks; 0 newly broken repos; 0 sync failures. Three new skills were admitted, each inside a repo that already had skills. No new-repo throughput can be measured |
| Pending age | Normal queue: 1 due, oldest/p50/p95 36.72 hours. Subscribed queue: 5 due, oldest/p50/p95 1.82 hours |
| Failure and retry | Scheduled network failures leave admitted repos due. Owner scan failures have no durable retry or scan record. Broken and skill-less repo candidates are excluded from scheduled sync. No overlap lock exists |
| Deduplication | Repo upserts are keyed by owner/repo. Activity has no natural-key uniqueness, so concurrent or repeated inserts can duplicate. ETags apply to REST paths, not the [GraphQL](https://graphql.org) summary fetch used here |
| Silent drop | `last_tree_sha` advances before blob processing. `blobsRes.data ?? new Map()`{lang="ts"} converts a failed blob batch into empty data; parsing skips files; existing skills are quarantined; the committed tree SHA prevents retry. A new repo can be left with a committed SHA and no skill, then excluded forever |
| Cost | Current observed GitHub work is modest at 42 checks/day, but a run can issue one GraphQL request plus tree/blob work for each of 250 repos. Request count and rate-limit consumption are not recorded |

#### Organic discovery verdict: partial

The hourly path is correctly finding newly added skills inside already admitted repos. The three skills first seen in the exact 24-hour window came from `stripe/ai`, `ibelick/ui-skills`, and `vercel/ai`; each repo already contained an older skill.

New repositories are different. There is no ecosystem-wide scheduled search. The only live search calls `filename:SKILL.md user:<authenticated-login> is:public` on first login or manual profile rescan. It excludes forks, private repos, organizations the user belongs to, and every owner who never signs in. GitHub limits results to 1,000; `incomplete_results` is ignored; the UI does not show the returned total hit count.

The stars import is not discovery. It keeps starred repos whose name contains `skill`, then sets `has_skill` by looking in the existing registry. Production has 574 cached stars from one user and 12 matches; unknown starred repos are not synced.

Production cannot prove the owner-scan path has ever admitted a skill. Migration `0063`, applied `2026-07-12 17:59:27`, added `owner_verified`; 0 of 3,074 skills have that marker. Two users have logged in since the migration, but neither maps to a current skill owner. This is limited evidence because no user has been active in the last seven days.

There are direct correctness defects even when an owner does scan:

* Search accepts a root `SKILL.md`; `syncRepo` accepts only paths ending `/SKILL.md`. A root-only repo is reported as synced with zero skills and then marked broken.
* `reposSynced` counts `status='ok'` or a SHA skip, even when `skillsUpserted=0`.
* If a repo already has the same tree SHA, owner verification returns early and never promotes its existing skills to `owner_verified=1`.
* If blob loading fails after the repo SHA write, the repo has no skill rows. The scheduler's `EXISTS (SELECT 1 FROM skills ...)`{lang="ts"} predicate then prevents recovery.
* The indexability gate does not persist rejected skill candidates. Its comment says an existing row can later graduate, but rejected rows do not exist and their repo is not revisited.

The inventory shows the scale of that last point: all 7,067 skill-less repos claim at least one skill file in `repo_skill_count`; 5,775 have a committed tree SHA; 5,295 are unbroken. Two repo rows whose owner matches a current user also claim skill files and have committed SHAs but no skills. Those two predate migration `0063`, so they demonstrate the inert state, not a recent scan regression.

Discovery has no durable candidate queue, scan history, source, cursor, rejection reason, or coverage metric. Therefore the production answer is: known-repo discovery works; organic new-repo discovery is narrow, silent on partial scans, and cannot establish completeness.

### 2. Repos, skills, revisions, and activity

| Item | Result |
|---|---|
| Input | Successful repo sync parse |
| Output | `skills`, `skill_revisions`, `activity`, `skill_dirty` |
| Trigger | Within hourly GitHub sync |
| Volume | 3,074 skills; 16,332 revisions; 176,157 activity rows |
| 24-hour throughput | 3 new skills. Revision source timestamps show 4 changes; activity source timestamps show 31 events. Those two are event volume, not verified ingestion volume |
| Pending age | No queue table exists between parsing and writes |
| Failure and recovery | D1 batch writes are grouped, but upstream tree acknowledgment can precede complete blob work. Revision/activity history has no repair audit |
| Deduplication | Skill identity is repo/owner/name. Slug is not unique: 24 duplicate slug groups, 24 excess rows. Activity contains 7,245 duplicate groups and 63,860 excess rows |
| Orphans | 16 revisions have no skill; 155,958 activity rows have no skill. Foreign-key check reports zero because these tables do not enforce every logical relationship |
| Impossible state | 26 skills are `source_resolved=0` but indexable. 116 skills on broken repos remain source-resolved and indexable |
| Cost | D1 is 524,439,552 bytes. Activity is the largest obvious stale-data pool; exact storage by table is unavailable from D1 SQL |

`repos.repo_skill_count` is wrong for 7,257 of 7,363 repos, with maximum absolute delta 23,909. This includes 5,464 unbroken repos and 1,793 broken repos. Current scoring calculates live counts and does not rely on the column, but other consumers can read false values.

### 3. Dirty score recomputation

| Item | Result |
|---|---|
| Input | `skill_dirty`, or all `skills` during the daily full run; repos, collections, social posts, trust overrides |
| Output | score, trust, rank, indexability, and denormalized counters on `skills`; dirty rows deleted after processing |
| Trigger | Incremental `*/5 * * * *`; full `0 3 * * *` |
| Volume | 0 dirty rows now; 3,074 skills total |
| 24-hour throughput | 296 skills have a recent score timestamp. Full run completed in 32.288 seconds. Exact incremental processed count is not retained |
| Pending age | n/a, queue empty |
| Failure and retry | Failed items remain dirty and `attempts` increments. There is no maximum attempt, dead-letter state, per-item error, or attempt-age alert |
| Deduplication | Dirty table is one row per skill. Queue query groups and sorts, using a scan plus temporary B-tree |
| Integrity | Current collection, reason, and social counters match the implemented formula. The formula itself omits repo in curator matching |
| Silent corruption | Updates use owner/name without repo. `computeFromRow` can re-enable rows on broken repos because it ignores `repos.broken_since`, `repo_missing`, and stored `source_resolved` |
| Indexing | Candidate read starts from `repos_broken_idx`, uses correlated indexes, then a temporary order. Update plan uses `idx_skills_name_lookup(name, owner)`{lang="ts"} and cannot isolate repo collisions |
| Cost | Full scoring consumed 32.288 seconds of Worker wall time. D1 rows read and task CPU are not stored, so dollar cost is unknown |

`seo_index_synced_at` is older than 24 hours for 2,778 skills. This is not a failed-run count; unchanged rows do not receive a freshness write, so the field cannot prove full-run coverage.

### 4. Rendered skill content

| Item | Result |
|---|---|
| Input | GitHub source plus `skills.current_sha` and path |
| Output | `skills.rendered_raw`, `rendered_frontmatter`, `rendered_html`, `rendered_at`, `rendered_status`, and `rendered_skill_path` |
| Trigger | During sync, cold page repair, and reconcile task `20 */6 * * *` |
| Volume | 3,005 rendered OK; 69 have no rendered payload; 44 of those are active and 25 belong to broken repos |
| 24-hour throughput | 1,511 rows had `rendered_at` changed; this counts writes, not necessarily content changes |
| Pending age | 44 active null payloads. Five lack an age anchor. For 39 measurable rows: oldest 84.45 days, p50 81.53 days, p95 83.07 days |
| Failure and retry | Reconcile selects only `path_missing` or `fetch_failed`. Current null-status backlog is excluded. Cold rendering schedules persistence only for success |
| Silent drop | `renderLive` maps fetch failures to `path_missing`; cold failures are not persisted, so reconcile cannot distinguish or retry them |
| Integrity | No `rendered_status='ok'` row lacks its payload; no non-OK row has stale HTML |
| Indexing | Reconcile starts from `repos_broken_idx`, then `idx_skills_owner_repo`; it uses temporary B-trees for distinct/order. There is no selective index for active render failures |
| Cost | Markdown and HTML are stored in D1 and AI-ready FTS, contributing to the roughly 500 MiB database. Render attempts and Shiki fallbacks are not counted |

### 5. AI batches and generated metadata

| Item | Result |
|---|---|
| Input | Eligible, rendered, indexable skills; `skill_generated`; `ai_batch_submissions` |
| Output | `ai_batches`, `ai_batch_submissions`, `ai_batch_costs`, `skill_generated` kinds `summary`, `tags`, `faq`, `abstractness`, `embedding` |
| Trigger | Poll `0 * * * *`; submit `45 * * * *`. Anthropic summary/tags/faq generation is intentionally paused |
| Volume | 2,693 eligible skills; 520 batches, all completed; 4,889 submissions; 515 cost rows |
| 24-hour throughput | 0 batches submitted/completed; 0 pending/stuck/failed; 30 unique abstractness rows and 96 unique embedding rows were touched |
| Pending age | 1,126 eligible skills lack current summary/tags/faq. Oldest 61.11 days, p50 22.83 hours, p95 17.94 days. D1 reports only 3 embedding markers pending |
| Failure and retry | Poll retries old submitted batches indefinitely. Non-OK status fetches only log. No attempt count or last error is stored. Per-line result errors are skipped |
| Deduplication | A partial unique index prevents duplicate active content SHA submissions. Remote batch creation occurs before D1 persistence, so a D1 failure can leave an untracked paid batch |
| Impossible state | 573 skills have `ai_generated_sha != current_sha`. One summary payload still uses legacy `{tagline}` shape and yields no current UI summary |
| Cost | Recorded Anthropic total: $22.633369, 37,125,518 input tokens, 1,628,244 output tokens. Recorded 24-hour Anthropic cost: $0. Workers AI and Vectorize cost are unrecorded |

Generated rows by kind:

| Kind | Total | Current SHA | Stale SHA |
|---|---:|---:|---:|
| abstractness | 1,746 | 987 | 759 |
| embedding | 2,756 | 2,753 | 3 |
| faq | 2,385 | 1,795 | 590 |
| summary | 2,386 | 1,795 | 591 |
| tags | 2,398 | 1,795 | 603 |

The paused AI kinds keep a skill eligible for submission. The loop still calls embedding and abstractness even when those kinds are current. At the configured maximum, this is up to 2,400 Workers AI calls and 1,200 Vectorize upserts per day. Actual call volume is unknown because only unique D1 rows, not attempts, can be counted.

Two poll correctness risks need tests. A batch can become `completed` after partial per-line failures. Also, final status uses a run-wide `rowsWritten` counter, so an expired batch processed after a successful batch can be misclassified.

### 6. Embeddings and Vectorize

| Item | Result |
|---|---|
| Input | Rendered skill text selected by AI submit |
| Output | D1 `skill_generated(kind='embedding')`{lang="ts"}; Vectorize index `skill-embeddings`, 768 dimensions |
| Trigger | Inside hourly AI submit; semantic query at request time |
| Volume | Vectorize reports 3,037 vectors, processed through `2026-07-23T00:16:34.561Z` |
| 24-hour throughput | 96 unique embedding marker rows touched; call/upsert count unknown |
| Pending age | Among 2,693 eligible skills, 346 lack a vector. Oldest 69.92 days, p50 22.62 hours, p95 13.34 days |
| Failure and retry | `embedAndUpsert` catches Vectorize upsert failure, then unconditionally writes the current D1 marker. The failed vector becomes permanently invisible to the normal pending query |
| Deduplication | Vector ID is SHA-256 of stable skill ID. Upsert replaces the same vector ID |
| Orphans | 639 vector IDs do not map to a current skill. No deletion/reconciliation path exists |
| Impossible state | 344 eligible skills lack a vector while D1 says embedding is current; only 2 eligible missing vectors lack a current marker. Two current-skill vectors lack a current marker |
| User recovery | Semantic search falls back to lexical when the binding/query throws. Missing individual vectors do not throw, so reduced recall is silent |
| Cost | Workers AI invocation and Vectorize read/write charges are not recorded. Repeated current-kind work can reach 2,400 AI calls and 1,200 upserts/day at the configured bound |

The cross-check listed all vector IDs, recomputed each current skill's SHA-256 vector ID, and compared the two sets. It did not mutate the index.

### 7. AI-ready and IndexNow

| Item | Result |
|---|---|
| Input | AI-ready route crawl/render tracking and `ai_ready_pages` |
| Output | AI-ready FTS state, IndexNow API submissions, `indexed_at`, `indexnow_synced_at`, `_ai_ready_info` |
| Trigger | `*/5 * * * *` from the module-generated scheduled handler |
| Volume | 143,310 pages; 143,230 ready; 80 errors; 11 IndexNow pending |
| 24-hour throughput | 8 rows received `indexed_at`; 0 received `indexnow_synced_at`; direct cron history is disabled |
| Pending age | Oldest 4.73 days, p50 16.13 hours, p95 4.73 days |
| Failure and retry | Current global backoff is attempt 4 after HTTP 429. Backoff increases through 5, 10, 20, 40, and 60 minutes. Pending rows remain queued |
| Deduplication | A content hash controls page changes. Cumulative submissions are `424419.0`, about 2.96 submissions per ready page; the counter does not distinguish valid updates from repeats |
| Silent drop | Sitemap `/sitemap.xml` has 0 URLs, 10 errors, and `XML does not contain a valid urlset element`; the runtime stops retrying after 10. A sitemap index is not parsed as a URL set |
| Indexing | Planner ignores partial `idx_ai_ready_pages_indexnow_pending`, scans 143,310 indexed rows, and takes 1,235.8 ms. Forced partial index reads 11 rows in 0.151 ms |
| Observability | `debugCron=false`; `ai_ready_cron_runs` and `indexnow_log` have no 24-hour rows. No `sync_jobs` row covers this schedule |
| Cost | The observed pending count can read about 41.3 million D1 rows/day. No IndexNow provider charge is recorded; response volume and 429 retry work are unmetered |

`sqlite_stat1` says the partial pending index has `0 0` rows even though it has 11. The broader indexed index reports `143274 1588`. At 288 runs/day, the observed plan can read about 41,273,280 rows/day for this one pending count.

### 8. Subscriptions and digest delivery

| Item | Result |
|---|---|
| Input | `users`, `skill_subscriptions`, `activity`, prior `digest_runs` |
| Output | Email provider request and `digest_runs` |
| Trigger | `0 * * * *`; the task checks each user's local configured hour and weekday |
| Volume | 17 users; 10 opt-in/onboarded/frequency-configured users; 9 subscriptions across 5 repos; 41 digest runs total |
| 24-hour throughput | 0 sent; 0 failed. Lifetime: 3 sent with changes, 38 skipped, 0 failed |
| Pending age | One weekly subscriber is due-configured but has no recipient. It had 1,076 activity events after its effective cursor at gather time and 1,089 on a later rerun; oldest/p50/p95 user age 62.31 days |
| Failure and retry | Failed send rows would advance the next cursor because the cursor uses max `window_end` for every status. Failed windows therefore do not retry |
| Deduplication | `INSERT OR IGNORE` occurs after email send. Concurrent task runs or a post-send D1 failure can send a duplicate |
| Silent drop | `shouldFireForUser` rejects users with no target before the later no-recipient failure branch. No failure row or alert is written |
| Integrity | No subscription user/repo orphans; no digest user orphans; no subscription currently points to a repo with no skills |
| Data semantics | Activity time is source commit time. Late ingestion can fall before the prior digest window and disappear because activity lacks `ingested_at` |
| Cost | Zero sends in the window. Email provider and optional Workers AI summary cost are not recorded; late event buildup adds D1 reads |

The digest query groups by repo but selects one non-aggregated skill name. The email can name one skill while its count includes changes to several skills in that repo. AI summary errors fall back silently and have no cost or error metric.

The same query and fixed `occurred_at <= 1784767260` cutoff returned 1,076 events at gather time and 1,089 after the next hourly sync. Thirteen late-ingested events appeared inside a closed source-time window. This directly confirms the digest late-event risk.

### 9. Scheduled tasks and cf-jobs reporting

Actual production schedules after the deployment:

```text
0 * * * *
0 22 * * *
0 3 * * *
15 * * * *
20 */6 * * *
30 * * * *
45 * * * *
*/5 * * * *
```

These match the unique local cron definitions. `CRON.md` is stale: it describes prior frequencies and omits the current module-generated AI-ready trigger.

| Task | Cron | Last age | Duration | Runs | State |
|---|---|---:|---:|---:|---|
| `ai-generate-poll` | `45 * * * *` | 32 s | 291 ms | 1,603 | OK |
| `ai-generate-submit` | `15 * * * *` | 1,755 s | 42,436 ms | 1,602 | OK |
| `drain-skill-dirty` | `*/5 * * * *` | 32 s | 295 ms | 2,115 | OK |
| `recompute-skill-scores` | `0 3 * * *` | 78,296 s | 32,288 ms | 59 | OK |
| `reconcile-rendered` | `20 */6 * * *` | 1,497 s | 376 ms | 313 | OK |
| `send-digests` | `0 * * * *` | 2,697 s | 460 ms | 1,653 | OK |
| `sync-github-skills` | `0 * * * *` | 2,697 s | 0 ms | 1,316 | OK, no due work |
| `sync-social-mentions` | `30 * * * *` | 929 s | 3,663 ms | 1,601 | OK |

`daily-health-check` is newly scheduled for `0 22 * * *`. Migration and deployment landed after the prior 22:00 UTC slot, so no `sync_jobs` or `daily_health_checks` row is expected until its first run. AI-ready runs every five minutes but does not call the application reporter.

`sync_jobs` is a latest-state table, not run history. A task writes only when it finishes. A Worker termination cannot leave a `running` or failed record. This matters because Cloudflare recorded one `exceededMemory` outcome at `2026-07-22T13:00:52Z`, duration 4.818 seconds, 9 subrequests. The `:00:52` timing suggests an hourly scheduled invocation, but aggregate Worker dimensions cannot identify the task.

`jobs`, `job_schedules`, and `failed_jobs` all contain zero rows. No application task uses cf-jobs queues, and `reconcile=false`, so cf-jobs reservation recovery and retry behavior are dormant. If enabled, package defaults provide three attempts and active-job uniqueness. Stale reservation recovery requires reconciliation. Production is also missing three indexes expected by installed `nuxt-cf-jobs` 0.14; both dispatch and stale-reservation plans currently scan `jobs` and sort.

## Migration and schema drift matrix

The ledger contains all migrations through `0069_daily_health_checks.sql`. A clean in-memory application of all local migrations was compared with production `sqlite_master`. Every common object has the same normalized SQL. `PRAGMA foreign_key_check` returned zero rows.

| Migration/runtime owner | Ledger | Expected object | Production | Assessment |
|---|:---:|---|:---:|---|
| `0011_install_events.sql` | Yes | `install_events` | Missing | Drift; installation volume and 24-hour throughput unavailable |
| `0011_install_events.sql` | Yes | `idx_install_events_recent` | Missing | Drift caused by missing table |
| `0011_install_events.sql` | Yes | `idx_install_events_skill` | Missing | Drift caused by missing table |
| `0011_install_events.sql` | Yes | `idx_install_events_collection` | Missing | Drift caused by missing table |
| `0015_repo_trust_overrides.sql` | Yes | `idx_repo_trust_overrides_tier` | Missing | Drift; current table exists |
| `0065_ai_ready_query_indexes.sql` | Yes | `idx_ai_ready_pages_indexnow_pending` | Present | Object exists, stale statistics make planner ignore it |
| `0068_cf_jobs.sql` | Yes | `jobs`, `job_schedules`, `failed_jobs` and migration indexes | Present | Empty and unused |
| Installed cf-jobs 0.14 runtime | n/a | `idx_jobs_dispatchable` | Missing | Local migration targets an older runtime shape |
| Installed cf-jobs 0.14 runtime | n/a | `idx_jobs_stale_reserved` | Missing | Latent scan/sort cost |
| Installed cf-jobs 0.14 runtime | n/a | `idx_failed_jobs_batch` | Missing | Latent failed-job lookup cost |
| `0069_daily_health_checks.sql` | Yes | `daily_health_checks`, `idx_daily_health_checks_created_at` | Present | Known pre-deploy absence is now resolved; no first run yet |
| nuxt-ai-ready runtime init | n/a | pages, FTS, triggers, cron/log/info/sitemap objects | Present | Runtime-managed rather than migration-ledger managed |

Two migration design hazards remain even where production matches a clean replay:

* `0015` uses `CREATE TABLE IF NOT EXISTS`, so it cannot add columns to the table created in `0014`. Clean replay and production agree, but later migration intent is not fully applied.
* `0033` rebuilds `skills` and does not restore every earlier secondary index. Schema replay therefore normalizes an accidental loss rather than detecting it.

## Data-quality invariants

| Invariant | Violations |
|---|---:|
| Every skill references an existing repo | 0 |
| Every revision references an existing skill | 16 |
| Every activity row references an existing skill | 155,958 |
| Every generated row references an existing skill | 0 |
| Every dirty row references an existing skill | 0 |
| Every subscription references an existing user and repo | 0 |
| Every digest run references an existing user | 0 |
| Every social post slug resolves to a skill | 9 |
| Skill slug is unique | 24 duplicate groups, 24 excess rows |
| Owner/name identifies one skill | 24 collision groups, 48 rows |
| Activity natural event tuple is unique | 7,245 duplicate groups, 63,860 excess rows |
| `repos.repo_skill_count` equals live skill count | 7,257 |
| Broken repo has no source-resolved/indexable skill | 116 |
| `source_resolved=0` implies `indexable=0` | 26 |
| Render status OK implies HTML payload | 0 |
| Non-OK render state has no HTML payload | 0 |
| Current AI marker implies summary, tags, and FAQ | 0 |
| AI marker SHA equals current content SHA | 573 |
| Current eligible embedding marker has a Vectorize vector | 344 |
| Current Vectorize vector maps to a current skill | 639 |
| FTS row count equals skill row count | 0, both 3,074 |
| Foreign-key check | 0 |

Some sets overlap. For example, activity orphans and duplicates must not be added to estimate a safe purge volume.

## Timestamp contract

| Area | Unit/type | Boundary behavior |
|---|---|---|
| `repos`, `skills`, activity, revisions, subscriptions, digests, sync jobs | Unix seconds | JavaScript uses `Math.floor(Date.now()/1000)`{lang="ts"}; GitHub ISO dates parse to seconds |
| `ai_batches`, submissions, costs | Unix seconds | Anthropic timestamps and polling cutoffs convert at the API boundary |
| `skill_generated.generated_at` | ISO 8601 text | Compared as text for display; content SHA is the freshness key |
| `ai_ready_pages.indexed_at`, `indexnow_synced_at` | Unix milliseconds | Runtime uses `Date.now()`{lang="ts"}; converting these as seconds would inflate dates by 1,000 |
| AI-ready cron/log/sitemap timing | Unix milliseconds | `_ai_ready_info` values are JSON strings containing millisecond epochs |
| `daily_health_checks.created_at` | Unix seconds | New application migration follows the main schema convention |
| `d1_migrations.applied_at` | Text timestamp | Ledger metadata, not application event time |

The principal boundary risk is not a current 1,000-times conversion bug. It is mixed conventions in the same database with no type-level marker. The larger measurement gap is missing `ingested_at`, `attempted_at`, and run-history timestamps.

## Exact SQL evidence

All statements below were issued read-only against production. Results are condensed only by selecting the relevant aggregates.

### Schema ledger versus objects

```sql
SELECT id, name, applied_at
FROM d1_migrations
ORDER BY id DESC
LIMIT 3;

-- 69 | 0069_daily_health_checks.sql | 2026-07-23 00:38:46
-- 68 | 0068_cf_jobs.sql              | 2026-07-22 05:47:56
-- 67 | 0067_sync_job_run_count.sql   | 2026-07-08 07:09:44

SELECT type, name
FROM sqlite_master
WHERE name IN (
  'install_events',
  'idx_install_events_recent',
  'idx_install_events_skill',
  'idx_install_events_collection',
  'idx_repo_trust_overrides_tier',
  'jobs', 'job_schedules', 'failed_jobs',
  'daily_health_checks', 'idx_daily_health_checks_created_at'
)
ORDER BY name;

-- daily_health_checks table present
-- failed_jobs table present
-- idx_daily_health_checks_created_at present
-- job_schedules table present
-- jobs table present
-- install_events and its indexes absent
-- idx_repo_trust_overrides_tier absent

PRAGMA foreign_key_check;
-- 0 rows
```

### Core volumes and 24-hour facts

Discovery-specific evidence:

```sql
SELECT
  COUNT(*) AS no_skill_repos,
  SUM(r.repo_skill_count > 0) AS claims_skill_files,
  SUM(r.repo_skill_count > 0 AND r.broken_since IS NULL) AS claims_files_unbroken,
  SUM(r.repo_skill_count > 0 AND r.last_tree_sha IS NOT NULL) AS claims_files_committed_sha
FROM repos r
WHERE NOT EXISTS (
  SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo
);

-- 7067 | 7067 | 5295 | 5775

SELECT
  COUNT(*) AS skills,
  SUM(owner_verified = 1) AS owner_verified_skills,
  SUM(first_seen_at >= 1784680860) AS new_24h,
  SUM(owner_verified = 1 AND first_seen_at >= 1784680860) AS owner_verified_new_24h,
  SUM(first_seen_at >= 1784162460) AS new_7d,
  SUM(first_seen_at >= 1782175260) AS new_30d
FROM skills;

-- 3074 | 0 | 3 | 0 | 40 | 193

SELECT
  SUM(first_seen_at >= 1784680860) AS skills_24h,
  COUNT(DISTINCT CASE WHEN first_seen_at >= 1784680860
    THEN owner || '/' || repo END) AS repos_24h,
  SUM(first_seen_at >= 1784680860 AND EXISTS (
    SELECT 1 FROM skills older
    WHERE older.owner = skills.owner
      AND older.repo = skills.repo
      AND older.first_seen_at < 1784680860
  )) AS new_skills_in_preexisting_skill_repos
FROM skills;

-- 3 | 3 | 3

SELECT
  COUNT(*) AS users,
  SUM(stars_synced_at IS NOT NULL) AS users_stars_synced,
  (SELECT COUNT(*) FROM user_starred_repos) AS cached_stars,
  (SELECT SUM(has_skill) FROM user_starred_repos) AS registry_matches
FROM users;

-- 17 | 1 | 574 | 12
```

The scheduled candidate predicate that excludes all skill-less repos is:

```sql
SELECT r.owner, r.repo, r.repo_meta_synced_at AS ls
FROM repos r
WHERE r.broken_since IS NULL
  AND (r.repo_meta_synced_at IS NULL OR r.repo_meta_synced_at < ?1)
  AND EXISTS (
    SELECT 1 FROM skills s
    WHERE s.owner = r.owner AND s.repo = r.repo
  )
ORDER BY r.repo_meta_synced_at IS NULL DESC, r.repo_meta_synced_at ASC;
```

There is no `discovery_runs`, candidate, or rejection table from which to query scan throughput or age.

```sql
SELECT
  (SELECT COUNT(*) FROM repos) AS repos,
  (SELECT COUNT(*) FROM repos WHERE broken_since IS NOT NULL) AS broken_inventory,
  (SELECT COUNT(*) FROM repos WHERE broken_since >= 1784680860) AS newly_broken_24h,
  (SELECT COUNT(*) FROM skills) AS skills,
  (SELECT COUNT(*) FROM skills WHERE first_seen_at >= 1784680860) AS new_skills_24h,
  (SELECT COUNT(*) FROM skill_revisions) AS revisions,
  (SELECT COUNT(*) FROM activity) AS activity,
  (SELECT COUNT(*) FROM skill_dirty) AS dirty;

-- repos 7363 | broken 1794 | newly broken 0 | skills 3074
-- new skills 3 | revisions 16332 | activity 176157 | dirty 0

SELECT
  COUNT(*) AS repos_checked_24h,
  (SELECT COUNT(*)
   FROM skills
   WHERE sync_status IS NOT NULL
     AND sync_status != 'ok'
     AND last_synced_at >= 1784680860) AS skill_sync_failures_24h
FROM repos
WHERE repo_meta_synced_at >= 1784680860;

-- 42 | 0
```

### Pending queue ages

```sql
WITH due AS (
  SELECT 1784767260 - COALESCE(repo_meta_synced_at, 0) AS age_s
  FROM repos r
  WHERE r.broken_since IS NULL
    AND EXISTS (SELECT 1 FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo)
    AND COALESCE(r.repo_meta_synced_at, 0) < 1784767260 - 36 * 3600
), ranked AS (
  SELECT age_s, ROW_NUMBER() OVER (ORDER BY age_s) rn, COUNT(*) OVER () n
  FROM due
)
SELECT COUNT(*) pending, MAX(age_s) oldest_s,
       MAX(CASE WHEN rn = CAST((n + 1) * 0.50 AS INTEGER) THEN age_s END) p50_s,
       MAX(CASE WHEN rn = CAST((n + 1) * 0.95 AS INTEGER) THEN age_s END) p95_s
FROM ranked;

-- 1 | 132180 | 132180 | 132180

WITH pending AS (
  SELECT 1784767260 - s.last_synced_at AS age_s
  FROM skills s
  JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
  WHERE r.broken_since IS NULL
    AND s.rendered_html IS NULL
    AND s.last_synced_at IS NOT NULL
), ranked AS (
  SELECT age_s, ROW_NUMBER() OVER (ORDER BY age_s) rn, COUNT(*) OVER () n
  FROM pending
)
SELECT COUNT(*) measurable, MAX(age_s) oldest_s,
       MAX(CASE WHEN rn = CAST((n + 1) * 0.50 AS INTEGER) THEN age_s END) p50_s,
       MAX(CASE WHEN rn = CAST((n + 1) * 0.95 AS INTEGER) THEN age_s END) p95_s
FROM ranked;

-- 39 | 7296111 | 7044456 | 7177635
```

### Key integrity violations

```sql
SELECT COUNT(*)
FROM skills s
LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
WHERE r.owner IS NULL;
-- 0

SELECT COUNT(*)
FROM skill_revisions sr
LEFT JOIN skills s
  ON s.owner = sr.owner AND s.repo = sr.repo AND s.name = sr.name
WHERE s.name IS NULL;
-- 16

SELECT COUNT(*)
FROM activity a
LEFT JOIN skills s
  ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
WHERE s.name IS NULL;
-- 155958

SELECT COUNT(*)
FROM skills s
JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
WHERE r.broken_since IS NOT NULL
  AND s.source_resolved = 1
  AND s.seo_indexable = 1;
-- 116

SELECT COUNT(*)
FROM skills
WHERE source_resolved = 0 AND seo_indexable = 1;
-- 26

SELECT COUNT(*)
FROM repos r
WHERE r.repo_skill_count != (
  SELECT COUNT(*) FROM skills s WHERE s.owner = r.owner AND s.repo = r.repo
);
-- 7257

SELECT COUNT(*) AS groups, SUM(n - 1) AS excess
FROM (
  SELECT owner, name, COUNT(*) n
  FROM skills
  GROUP BY owner, name
  HAVING COUNT(*) > 1
);
-- 24 | 24

SELECT COUNT(*) AS groups, SUM(n - 1) AS excess
FROM (
  SELECT type, owner, repo, name, occurred_at, sha, COUNT(*) n
  FROM activity
  GROUP BY type, owner, repo, name, occurred_at, sha
  HAVING COUNT(*) > 1
);
-- 7245 | 63860
```

### Digest silent skip

```sql
SELECT u.id, u.digest_frequency, u.digest_dow, u.digest_hour, u.timezone,
       COUNT(DISTINCT sub.owner || '/' || sub.repo) AS repos,
       CASE WHEN trim(COALESCE(NULLIF(u.digest_email, ''), NULLIF(u.email, ''), '')) = ''
         THEN 0 ELSE 1 END AS has_recipient,
       COUNT(a.id) AS pending_events,
       MIN(a.occurred_at) AS oldest_event
FROM users u
JOIN skill_subscriptions sub ON sub.user_id = u.id
JOIN activity a ON a.owner = sub.owner AND a.repo = sub.repo
JOIN skills s ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
WHERE u.email_opt_in = 1
  AND u.digest_frequency != 'off'
  AND u.onboarded_at IS NOT NULL
  AND a.occurred_at > MAX(
    COALESCE((SELECT MAX(window_end) FROM digest_runs d WHERE d.user_id = u.id), 0),
    u.onboarded_at
  )
  AND a.occurred_at <= 1784767260
  AND (sub.muted_until IS NULL OR sub.muted_until <= 1784767260)
  AND r.repo_kind != 'aggregator'
GROUP BY u.id
HAVING has_recipient = 0 AND pending_events > 0;

-- user 17 | weekly | Monday | 09 UTC | 4 repos | no recipient
-- 1076 pending events at gather time | oldest age 5383933 seconds
-- The same source-time cutoff returned 1089 later in the audit, proving late ingestion.
```

### AI and Vectorize state

```sql
SELECT kind,
       COUNT(*) AS total,
       SUM(CASE WHEN sg.sha = s.current_sha THEN 1 ELSE 0 END) AS current_sha,
       SUM(CASE WHEN sg.sha != s.current_sha THEN 1 ELSE 0 END) AS stale_sha
FROM skill_generated sg
JOIN skills s ON s.owner = sg.owner AND s.repo = sg.repo AND s.name = sg.name
GROUP BY kind
ORDER BY kind;

-- abstractness 1746 | 987  | 759
-- embedding    2756 | 2753 | 3
-- faq          2385 | 1795 | 590
-- summary      2386 | 1795 | 591
-- tags         2398 | 1795 | 603

SELECT
  COUNT(*) AS batches,
  SUM(status = 'submitted') AS submitted,
  SUM(status = 'failed') AS failed,
  SUM(status = 'completed') AS completed,
  (SELECT ROUND(SUM(est_cost_usd), 6) FROM ai_batch_costs) AS cost_usd
FROM ai_batches;

-- 520 | 0 | 0 | 520 | 22.633369
```

Vector parity cannot be expressed in D1 SQL because Vectorize is a separate store. The read-only set comparison returned:

```text
Vectorize vectorCount                         3037
eligible active/rendered/indexable skills    2693
eligible skills with vector                  2347
eligible skills missing vector                346
missing vector with current D1 marker         344
missing vector without current D1 marker        2
vectors not mapping to a current skill         639
```

### IndexNow planner evidence

```sql
SELECT COUNT(*)
FROM ai_ready_pages
WHERE indexed = 1
  AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);

-- 11 rows; 143310 rows read; 1235.8186 ms

EXPLAIN QUERY PLAN
SELECT COUNT(*)
FROM ai_ready_pages
WHERE indexed = 1
  AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);

-- SEARCH ai_ready_pages USING INDEX idx_ai_ready_pages_indexed (indexed=?)

SELECT COUNT(*)
FROM ai_ready_pages INDEXED BY idx_ai_ready_pages_indexnow_pending
WHERE indexed = 1
  AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);

-- 11 rows; 11 rows read; 0.1511 ms

EXPLAIN QUERY PLAN
SELECT COUNT(*)
FROM ai_ready_pages INDEXED BY idx_ai_ready_pages_indexnow_pending
WHERE indexed = 1
  AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at);

-- SCAN ai_ready_pages USING INDEX idx_ai_ready_pages_indexnow_pending

SELECT idx, stat
FROM sqlite_stat1
WHERE tbl = 'ai_ready_pages'
  AND idx IN ('idx_ai_ready_pages_indexed', 'idx_ai_ready_pages_indexnow_pending');

-- idx_ai_ready_pages_indexed          | 143274 1588
-- idx_ai_ready_pages_indexnow_pending | 0 0
```

### Scoring identity and cf-jobs plans

```sql
EXPLAIN QUERY PLAN
UPDATE skills
SET seo_indexable = ?
WHERE owner = ? AND name = ?;

-- SEARCH skills USING COVERING INDEX idx_skills_name_lookup (name=? AND owner=?)
-- repo is absent from both predicate and index lookup

EXPLAIN QUERY PLAN
SELECT id
FROM jobs
WHERE status = 'pending' AND available_at <= 1784767260
ORDER BY priority DESC, available_at ASC
LIMIT 100;

-- SCAN jobs
-- USE TEMP B-TREE FOR ORDER BY

EXPLAIN QUERY PLAN
SELECT id
FROM jobs
WHERE status = 'reserved' AND reserved_at < 1784766960
ORDER BY reserved_at ASC;

-- SCAN jobs
-- USE TEMP B-TREE FOR ORDER BY
```

### Representative stage query plans

These plans used the implementation SQL with literal snapshot cutoffs and limits. The full general discovery predicate and digest evidence query appear above.

| Stage/query | Exact plan detail |
|---|---|
| General GitHub due queue | `SEARCH r USING INDEX repos_broken_idx (broken_since=?)`{lang="ts"}; correlated `SEARCH s USING COVERING INDEX idx_skills_owner_repo (owner=? AND repo=?)`{lang="ts"}; `USE TEMP B-TREE FOR ORDER BY` |
| Subscribed GitHub due queue | Same repo and skill lookups; `SEARCH sub USING COVERING INDEX idx_subs_repo (owner=? AND repo=?)`{lang="ts"}; temporary B-trees for group and order |
| Dirty queue picker | `SCAN skill_dirty USING INDEX sqlite_autoindex_skill_dirty_1`; `USE TEMP B-TREE FOR ORDER BY` |
| Render reconcile picker | `SEARCH r USING INDEX repos_broken_idx (broken_since=?)`{lang="ts"}; `SEARCH s USING INDEX idx_skills_owner_repo (owner=? AND repo=?)`{lang="ts"}; temporary B-trees for distinct and order |
| AI stale selector | Repo and skill lookups use `repos_broken_idx` and `idx_skills_owner_repo`; all five correlated kind probes use `sqlite_autoindex_skill_generated_1 (owner=? AND repo=? AND name=? AND kind=?)`{lang="ts"}; temporary order by installs |
| Digest selector | `SEARCH sub USING INDEX idx_subs_user (user_id=?)`{lang="ts"}; repo and skill primary keys; `SEARCH a USING INDEX idx_activity_skill (owner=? AND repo=? AND name=?)`{lang="ts"}; temporary group and order |
| Scoring update | `SEARCH skills USING COVERING INDEX idx_skills_name_lookup (name=? AND owner=?)`{lang="ts"}; this confirms the incomplete owner/name mutation key |
| IndexNow pending | `SEARCH ai_ready_pages USING INDEX idx_ai_ready_pages_indexed (indexed=?)`{lang="ts"}; the forced partial plan is `SCAN ai_ready_pages USING INDEX idx_ai_ready_pages_indexnow_pending` |
| cf-jobs dispatch/recovery | `SCAN jobs`; `USE TEMP B-TREE FOR ORDER BY` for both paths |

Required-index assessment:

| Stage | Assessment |
|---|---|
| Discovery and sync | Existing keys resolve repo and skill identity. Due selection still sorts after filtering. More important than a new index, candidates without skills need a separate state and due index |
| Revisions and activity | Revision lookup is adequate. Activity lookup serves digest, but no unique natural event index prevents duplicates |
| Dirty scoring | Queue is empty and current cost is small. At scale, the grouped picker needs a queue shape or index that orders by earliest `queued_at` without scanning/sorting |
| Rendering | Add a selective pending/failure index only after null rows receive an explicit state; current owner/repo path cannot select failure age efficiently |
| AI batches/generated | Generated primary key makes kind probes efficient. Selection still sorts the eligible skill set; split-by-kind queueing removes more work than another broad index |
| Vectorize | External index has no [SQLite](https://sqlite.org) plan. Required control is D1-to-Vectorize parity, not another D1 index |
| IndexNow | Required partial index exists. Planner statistics are false, so the runtime plan does not use it |
| Digests | Current indexes support the small workload. A unique delivery-window claim and activity event identity are correctness requirements |
| cf-jobs | `idx_jobs_dispatchable`, `idx_jobs_stale_reserved`, and `idx_failed_jobs_batch` are required by installed 0.14 before adoption |

## Observability gaps

| Gap | Consequence |
|---|---|
| Sentry token gets HTTP 403 for issue reads | Application issue counts and regressions are unavailable; the gatherer must report missing data |
| `sync_jobs` stores only the latest completion | No run-level throughput, duration distribution, missed-run history, or started-but-terminated signal |
| AI-ready cron debug disabled and no app reporter | Every-five-minute freshness and failures cannot be joined to actual cron invocations |
| Worker outcome lacks task name | The one memory failure cannot be attributed to GitHub, AI, scoring, digest, or another scheduled path |
| GitHub discovery has no scan record or candidate state | Coverage, truncation at 1,000 search results, 5,295 inert unbroken candidates, rejection reasons, and new-repo throughput are unknown |
| Revisions/activity lack insertion timestamps | 24-hour processing throughput and late-event loss cannot be measured |
| AI poll lacks per-batch attempts and errors | Infinite retry, partial result loss, and old submitted batches are hard to diagnose |
| Workers AI/Vectorize attempts and spend are absent | `$0` Anthropic spend can be misread as total AI spend |
| Vectorize parity is not checked | D1 can report current embeddings while vectors are missing |
| Digest preflight skips have no run row | Undeliverable users never appear as failures |
| `CRON.md` is stale | Human audits compare against obsolete schedules |
| Latest Test workflow failed while Deploy succeeded | Broken tests and lint did not gate the production deployment |

The failed Test workflow contained an accessibility failure in `addToCollection` and seven lint errors, including the new daily-health/gatherer work. The Deploy workflow is independent and completed successfully.

## Cost and throughput bottlenecks

| Area | Current evidence | Avoidable work or missing measurement |
|---|---|---|
| IndexNow | 143,310 rows read to find 11, every 5 minutes | About 41.3 million row reads/day for one count; partial index completes the observed query with 11 reads |
| Workers AI/Vectorize | AI submit took 42.436 s; 96 embedding and 30 abstractness rows touched in 24h | Paused Haiku kinds keep selecting rows; up to 2,400 Workers AI calls and 1,200 Vectorize writes/day; spend unknown |
| D1 storage | 524,439,552 bytes | 155,958 orphan activity rows, 63,860 duplicate excess activity rows, 639 orphan vectors; overlap and retention value need measurement before cleanup |
| Full scoring | Daily run took 32.288 s | Correlated queries and incomplete keys; exact rows-read cost was not retained in `sync_jobs` |
| Social sync | Latest run 3.663 s | Current implementation can make 51 Hacker News fetches/hour, about 1,224/day, for 50 repos plus site search; external request count is not stored |
| GitHub | 42 repo checks/day observed | Low today; upper bound is 250 repos/run plus tree/blob calls; request and quota usage unknown |
| Anthropic batches | $22.633369 lifetime, $0 in 24h | Five legacy batches have no cost row; Workers AI cost is outside this number |
| IndexNow submissions | 424,419 cumulative for 143,230 ready pages | 2.96 submissions per ready page; valid refreshes versus repeats cannot be separated |
| Digest | 0 sends in 24h | One undeliverable subscriber had accumulated 1,076 events at gather time; provider success/cost is absent from D1 |

## Ordered improvement plan and tests

No item below was implemented.

### Quick wins

| Order | Change | Proposed tests |
|---:|---|---|
| 1 | Write the D1 embedding marker only after a confirmed Vectorize upsert. Add a read-only parity alarm and repair command with explicit dry-run mode | Unit: rejected upsert writes no marker. Unit: successful upsert writes one marker. Integration: a missing vector with current marker is detected. Integration: retry restores vector and marker atomically from the pipeline's point of view |
| 2 | Make IndexNow pending queries use the partial index, refresh planner statistics on a safe cadence, and alert on 429 backoff age | Plan test: pending SQL selects `idx_ai_ready_pages_indexnow_pending`. Benchmark fixture: rows read scale with pending rows. State test: 429 schedules backoff and emits a run failure/metric. Recovery test: success clears backoff |
| 3 | Treat missing digest recipient as an explicit failed/preflight result; do not advance the cursor on failed delivery; claim a window before sending | Unit: no-recipient user writes a visible failure. Unit: failed run does not advance cursor. Concurrency: two invocations send once. Crash test: provider success plus D1 failure has a recoverable idempotency key |
| 4 | Add a deploy-time object verifier that compares the migration contract with `sqlite_master`, package-required cf-jobs indexes, and foreign-key checks | Fixture: ledger contains `0011` but table is missing, gate fails. Fixture: object SQL differs, gate fails. Fixture: expected legacy drop is allow-listed. Package fixture: installed cf-jobs version requires all runtime indexes |
| 5 | Restore issue-read access for the Sentry build token; alert on 403 and Worker non-success outcomes | Credential probe: authorized read succeeds. Negative test: 403 is an alert, not empty issue data. Synthetic Worker failure: task/run label reaches the alert. Daily gatherer snapshot: missing Sentry stays AMBER |
| 6 | Update `CRON.md` from generated definitions and add a schedule parity check | Test: every task cron plus module cron appears in generated docs and deployed schedules. Test: newly added task without reporter or exemption fails coverage |
| 7 | Add read-only discovery health to the daily report: new skills in known repos, new repos admitted, rejected candidates by reason, scan completeness, and owner-verified admissions | Snapshot test separates repo discovery from skill additions. Empty run history reports unknown. Truncated or incomplete GitHub search reports partial, never success. Candidate age percentiles use discovery time, not source commit time |

### Structural fixes

| Order | Change | Proposed tests |
|---:|---|---|
| 1 | Create a durable discovery-candidate state with source, discovered time, last attempt, rejection reason, retry state, and admission outcome. Schedule bounded reconsideration independently of `skills` | Known-repo test finds a newly added nested skill. Unknown-repo candidate enters the scheduler without a skill row. Rejected candidate can graduate after a trust change. Root `SKILL.md` is either supported or explicitly rejected. Fork, organization, private, 1,000-result, and `incomplete_results` cases produce explicit outcomes. Stars import behavior matches the chosen product scope |
| 2 | Make GitHub sync two-phase: persist the repo tree SHA only after all required blobs parse and downstream writes succeed. Owner verification must apply even on an unchanged tree; report sync only when a skill or explicit rejection was recorded | Failed blob batch leaves old tree SHA and retries next run. Partial batch cannot quarantine missing responses. Unchanged owner scan promotes existing skills. `skillsUpserted=0` cannot be reported as indexed. Success advances SHA exactly once. Concurrent runs keep activity unique |
| 3 | Use full skill identity `repo + owner + name` in scoring updates and curator joins. Define source resolution from repo health and every terminal sync state | Collision fixture: same owner/name in two repos updates only one. Broken repo fixture: recompute cannot set indexable. `repo_missing`, `path_missing`, and `fetch_failed` each produce the expected tagged state. Counter property test compares denormalized values with full-key joins |
| 4 | Give render-null rows a real state and include them in bounded reconciliation. Persist cold-render failures with their correct error tag | Migration/parse test: every active null payload maps to a pending or failed tag. Retry test: transient fetch failure later succeeds. Query-plan test: reconcile uses a selective status/index path. Age-SLO test: old pending rows alert |
| 5 | Split AI work by missing kind. Do not recompute embedding/abstractness because summary/tags/faq are paused. Store per-batch attempts, line failures, and cost for every provider | Selection test: current embedding is not called when only summary is stale. Pause test: paused kinds do not create provider work. Poll test: mixed line results remain partial/failed. Ordering test: one batch's writes cannot affect another batch's final status. External-orphan test: remote batch plus D1 failure is reconciled |
| 6 | Add durable run history with started, completed, failed, and terminated/expired states for every schedule, including AI-ready. Link Cloudflare invocation IDs | Abrupt termination: started run ages into failed/expired. Success: exactly one terminal state. Schedule SLO: missed cadence alerts. Correlation test: Worker outcome maps to task and run |
| 7 | Add ingestion timestamps and durable event identities to revisions/activity, then make digest windows use ingestion/cursor semantics that handle late GitHub events | Late-event test: old `occurred_at`, new `ingested_at` appears in the next digest. Duplicate insert test: natural event key writes once. Backfill test: legacy event has explicit unknown-ingestion handling |
| 8 | Reconcile deletions across D1 and Vectorize; define retention before removing orphan activity/revisions/repos | Deletion integration: deleting/quarantining a skill removes or excludes its vector. Dry-run test reports exact candidates without mutation. Retention fixture preserves referenced audit rows. Idempotency: repeat cleanup makes no further changes |
| 9 | Align migration `0068` with installed cf-jobs 0.14 before any queue adoption; enable recovery only with run-level monitoring | Schema test asserts all runtime indexes. Plan tests cover dispatchable and stale-reserved queries without sort scans. Retry test reaches failed_jobs after three attempts. Recovery test requeues a stale reservation once |

### Measurements before tuning or cleanup

| Order | Measurement | Proposed tests |
|---:|---|---|
| 1 | Daily D1-to-Vectorize parity: eligible, present, missing, stale, orphan, and age percentiles | Known-set fixture returns exact counts; monitoring test alerts on absolute and percentage thresholds |
| 2 | Per-stage throughput and p50/p95 age from ingestion and attempt timestamps | Clock-controlled fixtures validate second versus millisecond conversion and percentile boundaries; empty queues return `n/a` |
| 3 | D1 rows read, duration, and invocations by task/query family | Query telemetry fixture attributes a known statement to one run; budget test flags IndexNow-style full scans |
| 4 | Provider calls, tokens, vector writes, and cost for Anthropic, Workers AI, Vectorize, email, GitHub, and IndexNow | Billing adapter tests aggregate retry and success separately; missing provider data is `unknown`, never zero |
| 5 | Search quality before vector repair: lexical fallback rate, semantic result coverage, and click-through for missing-vector skills | Offline corpus test compares recall before/after parity. Request test distinguishes full semantic, partial semantic, and lexical fallback modes |
| 6 | Data-retention value and overlap for orphan/duplicate activity before deletion | Read-only candidate query test accounts for overlap. Referential snapshot test proves retained digest/audit inputs remain reachable |

## Top five actions

1. Stop marking embeddings current when Vectorize upsert fails; measure and repair the 346 eligible missing vectors.
2. Add a durable new-repo candidate pipeline; reconsider the 5,295 unbroken skill-less repos and distinguish admitted, rejected, partial, and failed scans.
3. Make GitHub tree advancement transactional with complete blob processing; apply owner verification on unchanged repos.
4. Fix digest preflight, cursor, and send idempotency; surface the undeliverable subscriber.
5. Add migration object verification and restore observability: `install_events`, cf-jobs 0.14 indexes, Sentry reads, and task-level run history.
