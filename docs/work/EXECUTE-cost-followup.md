# Cost and D1 overload follow-up

Status: open · 2026-09-29 · fixes shipped in #295 to #307; re-measure due 2026-10-06

**Next move:** Ready. Reproduce the pnpm exemption rewrite independently. The full-week comparison waits until 2026-10-06, covering 2026-09-30 to 2026-10-06.

Done means: every metric in the baseline table meets its target for the week 2026-09-30 to 2026-10-06, or the miss has its own ledger item.

## Ledger

- [ ] Measure the week against the baseline table below
- [ ] Check zone security events for blocked or challenged requests from real users, including Harlan's own Unlighthouse and nuxtseo crawls
- [ ] Stop `pnpm install` from rewriting `minimumReleaseAgeExclude`. It dropped the comment on the `skilld` CLI exemptions twice on 2026-09-29.
- [ ] Re-time uncached skill pages (2.4 to 3.8 s before #305 and #306)
- [ ] Move this brief to `shipped/` once every target is met
- [ ] Decide whether a zone rate limit on `/gh/*` is needed. If added, exempt verified bots with `not cf.client.bot`.

## What shipped on 2026-09-29

| Change | Metric it moves |
| --- | --- |
| #295 icon collections resolve during SSR | Workers Logs events |
| #296 watchdog query seeks by index; `scheduled_runs` pruned | D1 rows read |
| #297 per-skill cache moved from KV to the Cache API | KV_CACHE writes |
| #298 malformed `/gh` segments return a 9 B 404 | CPU and requests |
| #299 and #305 indexes and merged render queries | D1 rows read per request |
| #303 D1 Sessions API; replication set to `auto` | Primary read share; "D1 overloaded" |
| #306 related skills load in the browser | Reads per SSR render |

## Baseline and targets

| Metric | Baseline | Target for the week |
| --- | --- | --- |
| Workers Logs events | ~1.3M/day | under 300k/day |
| KV_CACHE writes and deletes | 45k to 65k/day | under 8k/day |
| skilld-db rows read | ~550M/day | under 250M/day |
| D1 rows read per request | ~820 (09-29 07:00 UTC) | under 400 |
| Primary share of D1 reads | 100% | under 20% |
| Workers CPU | ~8.7M ms/day | under 6M ms/day |
| [Sentry](https://sentry.io) "D1 DB is overloaded" | ~290 events in September | 0 |
| Account D1 reads vs the 25B allowance | ~25.2B/month | under |

## How to measure

The `.env` `CLOUDFLARE_API_TOKEN` reads GraphQL Analytics and Workers Observability. It has no billing or WAF scope. Run `cf` from outside the repository, so it uses the OAuth login, which can read WAF rules. Account `5904138d55ca25d5670dca6adf99894e`; D1 `a5e53f35-f5e5-4987-8c67-c0175addc7cc`; KV_CACHE `187e636458cb49faa2ae14743adc7736`.

1. [GraphQL](https://graphql.org) `workersInvocationsAdaptive`, script `skilld-dev`: requests and `cpuTimeUs` per day.
2. GraphQL `d1AnalyticsAdaptiveGroups`: `readQueries` and `rowsRead` by `databaseRole`.
3. GraphQL `d1QueriesAdaptiveGroups` ordered by `sum_rowsRead_DESC`: check the top 10 for new offenders.
4. GraphQL `kvOperationsAdaptiveGroups` for KV_CACHE: writes and deletes per day.
5. Telemetry query `POST /accounts/<id>/workers/observability/telemetry/query`: event count per day, grouped by `$metadata.message`.
6. Sentry project `skilld`: search `overloaded`, `edge-cache-write` and `traceLifecycle`.
7. Zone security events. No WAF rule exists, so expect none to match.

To roll back replication, send `PUT /accounts/<id>/d1/database/<id>`{lang="html"} with `{"read_replication":{"mode":"disabled"}}`. It can take up to 24 hours.

## Log

- 2026-10-03 Separated the independent pnpm reproduction from the dated cost measurement. No cost measurements were read.

- 2026-09-29 Audit found skilld at ~$70/month gross. Workers Logs was the largest line, and ~87% of it was SSR icon warnings. Crawler bursts (09-22, 09-24, 09-29) overloaded the single D1 primary.
- 2026-09-29 One hour after replication: 90% of reads on replicas, and 0 Sentry events at 3.5 times normal traffic. Rows read per request fell from ~820 to ~340.
