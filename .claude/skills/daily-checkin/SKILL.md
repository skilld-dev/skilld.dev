---
name: daily-checkin
description: Gather skilld production health, growth, delivery, deploy, Workers, Sentry, D1, and pipeline evidence; compare it with the previous run; then write a concise morning verdict and action list. Use when the user says "daily checkin", "morning checkin", "what happened overnight", or asks for production status.
---

# Daily check-in

Produce one read-only morning report that answers: what changed, what broke, what drifted, and what deserves action.

## Workflow

1. Run `node scripts/tools/daily-checkin-data.mjs --save` from the repo root. Preserve every probe error as a finding. The command archives raw evidence in `docs/ops/checkins/YYYY-MM-DD.json`; same-day reruns use a timestamped sibling and do not move the next baseline.
2. Read the newest prior JSON archive and `docs/ops/triage-ledger.md`. Compare fingerprints and rates, not only totals. Treat a missing prior key as a new probe with no baseline.
3. Verify these gates first:
   - Read `checkin.severity`, `checkin.coverage`, and every result. Incomplete coverage cannot support GREEN.
   - `sentry.skilld` covers the retained unresolved backlog. Missing credentials or partial pagination remain findings.
   - `skilld.health-email` verifies the saved report against the current Worker version and a 36-hour age limit.
   - If backlog IDs lack archived triage details, fetch their details read-only and append them to the archive.
   - Any stable non-200 `skilld.dev` front door response is RED. A retry flap is a note.
   - Read every `ci.workflows` state. `failure` means the gate is broken. `pending` after a prior failure must be followed until complete. `missing` is an observability gap. Never infer overall CI health from only the deploy workflow.
   - Any `workers.nonOk`, new Sentry issue, failed digest, failed job, stale reserved job, stale scheduled task, or missing expected table needs an explicit verdict.
   - `d1.migrations.localHead !== d1.migrations.prodHead` is migration drift. Never assume deployment applied D1 migrations.
   - `d1.healthEmail` must show one sent operator report per Melbourne date after the feature is deployed. Missing, failed, or stuck `sending` rows are findings. Always report its archived `reasons`; the color alone is insufficient.
   - Use failed-job `first_failed_at` and `last_failed_at`, plus `d1.recentJobBatches` and `d1.registryMaintenance`, to distinguish an active incident from a recovered burst. Do not call a window clean because the latest batch passed, or active because an older batch failed.
   - Sentry issues must include their archived permalink and culprit in the proposed action. Archive any extra detail reads.
   - `d1.inventory.broken_repos` is known cumulative inventory. Review `d1.pipeline.newly_broken_repos_total`, but gate health on `d1.pipeline.newly_broken_repos_impacted`. A source removal is impacting when it still backs a skill or appears in a star, subscription, collection, or install event.
   - AI cost is only the recorded batch estimate. Unmeasured services are unknown, not $0.
   - X API is pay-per-use at $0.005 per post read, with no included allowance and a $20/month target. Accepted 2026-08-31 at a projected $18.15/month, which raised the target from $10. Gate on `d1.cost`:
     - `x_over_budget` true is AMBER. The daily discovery budget failed to hold and the month will overrun.
     - `x_projected_monthly_usd` above 40 is AMBER, above 60 is RED, even when `x_over_budget` is false. Harlan raised the accepted line from $30 to $40 on 2026-09-07 (issue #160). Report the figure every run, not only when it breaches.
     - `x_budget_used_pct` at 100 on consecutive days means discovery is truncating. That is the designed steady state, not a fault. Say so rather than reporting it as a failure.
     - `x_discovery_reads_today` is the billed number. `x_posts_24h` counts only posts that survived repo extraction, so a large gap between them means the search query is paying for posts it discards. Flag a gap above 50% as a query-tuning action.
4. Write `docs/ops/checkins/YYYY-MM-DD.md`:
   - First line: GREEN, AMBER, or RED plus one sentence.
   - Pulse: users, skills, repo changes, installs, digests, known AI cost, and X spend as `$X.XX/mo projected (N/<x_budget_target> reads today)`.
   - Overnight: deploy and CI changes.
   - Broken: only new or regressed fingerprints, each with evidence and a one-line hypothesis.
   - Drift: migration, schema, deploy SHA, stale task, and observability gaps.
   - Proposed actions: numbered, ordered by user impact, each small enough for one focused work pass.
5. Update `docs/ops/triage-ledger.md` with genuinely new fingerprints. Use `watch` until investigated. Resolve only with evidence that a fix deployed and the signal stopped.
6. Print only the verdict, proposed actions, and report path.

## Rules

- Keep production access read-only. Do not apply migrations, retry jobs, mutate D1, deploy, or change Sentry state.
- Every reported number must come from the archived JSON. Extra reads are allowed only to investigate a new fingerprint, and must remain read-only.
- Lead with failed probes. Missing data cannot support GREEN.
- Compare step changes over equivalent windows. Do not turn cumulative queues or known broken inventory into overnight failures.
- Keep the last 30 days of paired JSON and Markdown reports. Never delete `state.json`.
