# Production triage ledger

Persistent fingerprints found by the daily check-in. Add rows only after evidence appears in an archived report.

| Fingerprint | Surface | Verdict | First seen | Last count | Evidence and next condition |
| --- | --- | --- | --- | ---: | --- |
| `repo fetch 401` on every sync candidate | sync-github-skills | open | 2026-07-25 | 10 per run | Captured live at 05:00:22Z: 10 of 10 repos fail in 251 ms, `rate-limited=0`. Production `GITHUB_TOKEN` rejected. Stuck repos last synced 2026-07-21 to 2026-07-23. Resolve when the token is rotated and a run reports `ok`. |
| Front-door 522 from Worker self-fetch | daily-health-check email | fix pending deploy | 2026-07-24 | 2 days | Retry in `76d94b3` did not help because the condition is deterministic: a public-URL fetch from inside the Worker never routes back. `SELF` service binding added in tree. Resolve when a deployed health run records 200. |
| [Sentry](https://sentry.io) probe 403 | daily-checkin observability | resolved 2026-07-25 | 2026-07-24 | 0 | Probe was reading the build-plugin token (source-map scope only). Now falls back to `~/.sentryclirc`, which has issue-read scope. Issues returning. |
| `malformed_acknowledgement` on vectorize embed | ai-generate-submit | resolved 2026-07-25 | 2026-07-24 | 0 | Fix `76d94b3` (accept Vectorize V2 async ack) deployed in `7f34707c`; submit runs report `ok`. |
| `Test` CI workflow red every commit | GitHub Actions | fix pending deploy | 2026-07-24 | 0 errors | Cause was lint, not tests: 43 em-dash errors in `docs/ops` plus 49 `no-silent-catch` across 26 files. All cleared in tree; `pnpm lint` clean. Resolve when the workflow passes on `main`. |
| `run expired before terminal state was recorded` | ai-ready:cron | watch | 2026-07-25 | 1 in 706 | Started 2026-07-24T23:10:41Z, hit the 300s ceiling. Backdrop is chronic `partial` rate limiting. Resolve if no further expiries appear over a week, escalate if the rate climbs. |
| `SKILLD-8` Could not load repository | GET /api/repos/tag/fixture | watch | 2026-07-25 | 1 event | First issue visible after the Sentry probe was fixed. Single user, single event. Resolve when triaged or the route is confirmed dead. |
| `SKILLD-7` reading 'split' of undefined | GET /collections/_CollectionAvatar | watch | 2026-07-25 | 2 events | Single user. Avatar component reads a field that can be undefined. Resolve when the null path is handled. |
