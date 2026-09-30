# Daily health check

The protected report route uses the public Nuxt Check-in runner.
The module discovers checks in `layers/identity/server/checks` during the build.

The existing summary builder and health evaluator keep their current policy.
Both checks share one summary collection and one observation time.
The independent required list detects missing check files.
A run has a 60-second deadline.
If collection fails, the report records incomplete coverage.
Active reads may continue because D1 cannot cancel an active query.

Each report includes deployment identity, severity, evidence coverage, and the full health summary.
A known failure stays RED when another source is unavailable.
Unavailable evidence can never produce GREEN.
Detailed evidence stays in the private report and agent archive.

The agent keeps its 07:40 daily check-in and removes its separate 06:20 Sentry run.
`send-digests` sends subscriber content, not system health emails.
Its outcome already enters the daily summary.
The embedding parity audit keeps its independent schedule and pruning policy.
Its recorded scheduled-run outcome already enters the daily summary.

## Release

The check-in uses published `@harlan-zw/nuxt-checkin@0.3.0` and `@harlan-zw/nuxt-sentry@0.1.7`.
The lockfile resolves registry packages.

## External daily check-in

The external daily script runs the public [Sentry](https://sentry.io) backlog check with the live health report.
It validates report age, required checks, site, environment, and the deployed Worker version.
Missing credentials or stale reports produce unavailable evidence.
Sentry credentials stay in the existing external locations.
Set `SENTRY_ENVIRONMENT` after confirming the production mapping.
Without that setting, the backlog check includes all project environments.

The existing detailed Sentry probe runs only when the shared check finds unresolved issues.
It keeps recurrence and impact details for triage.
That extra request remains an optimization opportunity.
Live credentials and the environment mapping remain unverified.

## Shared CLI

Run `pnpm checkin --save` to prepare and execute registered external checks.
The shared CLI writes daily archives and keeps successful state boundaries.
Same-day reruns preserve the morning baseline.
Read `results[].result.evidence` for each registered check.
The `skilld.database` result retains inventory, activity, pipeline, and cost evidence.
The `skilld.sentry-details` result retains new and recurring issue details.
The published `@harlan-zw/nuxt-checkin@0.3.0` supplies the CLI.

The `skilld.baseline` result records fresh or stale comparison windows.
Invalid saved state stops the CLI before collection and never advances the saved baseline.

The agent tracking issue replaces system-health email delivery.
Set the private `NUXT_CHECKIN_TOKEN` Worker secret and the same token in the agent environment.
The protected `/api/internal/checkin` route runs the existing health checks on demand.
The report must match the deployed Worker and be less than five minutes old.
The daily health email cron and X API failure emails are removed. Customer digests remain unchanged.
Historical email records stay in D1, but checks no longer depend on them.

## SEO recovery measurement

The `skilld.seo-recovery` prompt item adds a weekly SEO recovery section.
It runs only on Mondays from 2026-10-12 through 2026-11-16, by the run date in Australia/Sydney.
On other days it adds nothing.
It reads `docs/work/EXECUTE-seo-recovery.md` and `docs/work/seo-recovery-panel.json`.
The brief and the panel file own the experiments and groups. The prompt skips any experiment the brief marks deferred.
It uses the `nuxtseo` CLI for reads only. It needs `nuxtseo` on the PATH and a token from `NUXTSEO_TOKEN` or `nuxtseo login`.
If either is missing, the section is one blocked line.
It never writes to NuxtSEO, gscdump, or Search Console.
Crawl stats and the Pages report are not in any API, so Harlan supplies those screenshots.
On 2026-11-09 and 2026-11-16 the section adds the gate decision table.
