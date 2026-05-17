# CRON.md

Audit of every scheduled task in skilld.dev, grilled findings, and ranked recommendations.

Last reviewed: 2026-05-17.

## Current state map

Cron schedules live in **two files that must stay in sync** — Nitro emits the runtime task registry, Cloudflare needs `triggers.crons` in wrangler config to actually fire them. See comment at `nuxt.config.ts:135-148`.

| Cron | Tasks | GH API? | Notes |
|------|-------|---------|-------|
| `0 * * * *` | sync-github-skills, send-digests, reconcile-rendered | YES (heavy) | Triple-stack at :00 |
| `15 * * * *` | ai-generate-submit | no (Anthropic Batch) | Hourly full-table scan |
| `30 * * * *` | sync-social-mentions | no (HN Algolia) | 201 req/cycle, no cursor |
| `45 * * * *` | ai-generate-poll | no (Anthropic) | LIMIT 20 backlog risk |
| `*/5 * * * *` | drain-skill-dirty | no | Cheap, correct |
| `0 3 * * *` | recompute-skill-scores | no | Daily drift safety net |

Producers of `skill_dirty`: collection write APIs (`server/api/collections/index.post.ts:40`, `.../skills/index.post.ts:60`, `.delete.ts:42`) and `sync-social-mentions.ts:140`. **No Cloudflare Queue / Durable Object usage**: `$DurableObject` is declared in `nuxt.config.ts:124-131` but unused (0 code refs).

---

## Grilled issues

### 1. Triple-stack at `:00` — real but narrower than it looks

**Evidence**: `nuxt.config.ts:170` registers sync-github-skills + send-digests + reconcile-rendered on the same cron string. Cloudflare invokes once; Nitro's `runTask` loop awaits each serially, so they don't overlap each other inside a single run.

**Actual risk**: collision with the **next** hour's run. sync-github-skills at CONCURRENCY=8 (`sync-github-skills.ts:9`) across 1.4k repos at ~1.5s/repo = ~260s; fits in 1h today but trending up. Cloudflare cron has no built-in lock.

**Counter-claim corrected**: reconcile-rendered does NOT duplicate sync-github-skills. It targets `rendered_status IN ('path_missing','fetch_failed')` (`reconcile-rendered.ts:42`); sync-github-skills iterates all repos with `broken_since IS NULL` regardless (`sync-github-skills.ts:67-76`). They overlap on render-failed-AND-stale repos but the cohorts differ.

**Fix**: stagger reconcile-rendered to `20 * * * *` + add `sync_jobs` overlap guard.

---

### 2. sync-social-mentions — 201 req/cycle, no incremental cursor

**Evidence**: `sync-social-mentions.ts:182` (1 site query) + `:211` `pAll(repoTargets, 4, ...)` with `TOP_N_REPOS=200` (`:19`) = **201 HN Algolia requests every 30 min** ≈ 9.6k/day. Dedup via `INSERT OR IGNORE` on `(skill_slug, platform, post_url)` (`:103-107`) is correct, but every cycle re-fetches the same historical posts.

**Blast**: $0 (free API), but 2-5min wall time per run; bounded CPU budget waste. Real risk: no headroom if HN slows.

**Fix**: add `numericFilters=created_at_i>${cutoff}` to URL at `:70`. Drops payload ~90%. Cursor table (`social_sync_cursor`) is the proper fix; tier per-repo frequency by trust_score.

---

### 3. ai-generate-submit — hourly full-table NOT EXISTS scan

**Evidence**: `ai-generate-submit.ts:75-117` runs 5x correlated `NOT EXISTS` subqueries against `skill_generated` for every `seo_indexable=1, rendered_status='ok'` skill, bounded by `BATCH_LIMIT=200` (`:6`).

**Blast**: D1 reads trivial. **The real cost is Anthropic**: submits up to 200 skills × 3 kinds = 600 Batch requests/hr even when nothing changed.

**Counter to "make it event-driven"**: poll-style is robust to backfill (new skills auto-picked up). Don't replace it; **add** an event-driven enqueue from `sync-repo.ts` on SHA change and keep the cron as recovery.

**Fix**: add `last_generated_sha` column on `skills`, filter via `s.current_sha != s.last_generated_sha`. Reduces typical batch from 200 → 5-20.

---

### 4. drain-skill-dirty every 5 min — AUDIT WAS WRONG, leave it

**Evidence**: `drain-skill-dirty.ts:48-57` single GROUP BY + early-return at `:60-61`. ~5ms CPU per empty invocation. Cron invocations on Workers Paid are $0.30/M; 288/day = $0.003/month.

**Verdict**: keep. The 5-min interval is a **Loop 1 feature**: trust counters on homepage cards must be fresh within ~5min of a collection mutation.

---

### 5. Duplicate config nuxt vs wrangler — NECESSARY, but driftable

**Evidence**: `nuxt.config.ts:135-148` comment explains why both lists exist. Not duplicate, but they CAN drift (silent cron-not-firing).

**Fix**: single-source. Define `scheduledTasks` once, then `triggers: { crons: Object.keys(scheduledTasks) }`. One source of truth.

---

### 6. No production lock — confirmed, low priority today

**Evidence**: no advisory lock. sync-github-skills relies on `aborted` flag + `RATE_LIMIT_GUARD=200` (`sync-github-skills.ts:9-10`). D1 writes via `INSERT...ON CONFLICT...UPDATE` are idempotent, so concurrent runs converge.

**Fix when needed**: pre-task `sync_jobs` check (`last_started_at > now-3600 AND last_completed_at IS NULL` → skip). Or repurpose the unused `$DurableObject` binding as a singleton lock.

---

### 7. send-digests fake H3Event — code smell

**Evidence**: `send-digests.ts:107-114` synthesises `{ context: { cloudflare: { env } } }`. Works because `sendEmail` (`layers/identity/server/utils/email.ts:36`) only touches `event.context.cloudflare?.env`.

**Fix**: split `sendEmail(event,...)` → `sendEmailWithEnv(env,...)` + thin event shim.

---

### 8. ai-generate-poll LIMIT 20 backlog risk

**Evidence**: `ai-generate-poll.ts:109` caps at 20. If backlog grows past 20, oldest batches starve and may hit Anthropic's 24h expiry.

**Fix**: raise to 100, add `WHERE submitted_at < now - 60` to skip racy-young batches.

---

## Recommendations (ranked, ship in this order)

| # | Change | Files | Effort | Quota/risk delta |
|---|--------|-------|--------|------------------|
| 1 | Single-source crons: `triggers.crons = Object.keys(scheduledTasks)` | `nuxt.config.ts:139-176` | S | Eliminates silent cron-not-firing |
| 2 | HN cursor: `numericFilters=created_at_i>cutoff` + drop TOP_N 200→50 | `sync-social-mentions.ts:70,19,211` | S | ~90% payload, ~2min wall-time per cycle |
| 3 | `last_generated_sha` column + filter; enqueue on SHA change in sync-repo | new migration, `ai-generate-submit.ts:75-117`, `sync-repo.ts` | M | Anthropic batch 200→~10; ~95% cost cut on stable weeks |
| 4 | Stagger reconcile-rendered to `:20` + add `sync_jobs` overlap guard | `nuxt.config.ts:170,174`; new util | S | Removes :00 stack; bounds long-running drift |
| 5 | Bump ai-generate-poll LIMIT 20→100, skip <60s-old batches | `ai-generate-poll.ts:109` | S | Prevents backlog expiry |
| 6 | Refactor `sendEmail(env, ...)`; delete fake event | `email.ts:35`, `send-digests.ts:107-114` | S | Removes fragile cast |

---

## Things to confirm / open questions

1. **Does `sync-repo.ts` use GitHub ETag/conditional requests?** Verified at `github-client.ts:111-138` (KV-backed ETag cache, 7-day TTL) — 304s do NOT consume primary rate limit. Good. But: at CONCURRENCY=8 × ~4-5 calls/repo × 1.4k repos = ~5.6k calls steady-state, **right at the 5k authenticated cap**. Past ~1.2k repos we'll hit it reliably. Mitigation: GitHub App auth lifts cap to 15k/hr.
2. **% of `ai_batches` ending in `expired`?** If non-zero, recommendation #5 is urgent.
3. **Acceptable digest lag?** Current design sends within 60min of slot. If product requires <5min, send-digests needs to move to per-user Durable Object alarms.
4. **Remove unused `$DurableObject` binding** (`nuxt.config.ts:124-131`) OR repurpose it as the singleton lock for #4.
5. **No Cloudflare Queue** for `skill_dirty` despite being a natural fit (replaces polling, gives retries, DLQ). Volumes too low to justify migration today; revisit at Phase 4.
6. **Cloudflare cron billing**: invocations are negligible ($0.30/M). Optimise for **GitHub quota (5k/hr cap), Anthropic batch $, and wall-clock**, not invocation count.
