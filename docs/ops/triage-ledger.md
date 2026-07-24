# Production triage ledger

Persistent fingerprints found by the daily check-in. Add rows only after evidence appears in an archived report.

| Fingerprint | Surface | Verdict | First seen | Last count | Evidence and next condition |
| --- | --- | --- | --- | ---: | --- |
| `malformed_acknowledgement` on vectorize embed | ai-generate-submit | watch | 2026-07-24 | 3 skills | find-skills/grill-me/pptx fail to embed → semantic search gap. Resolve when submit runs return `ok` and embedding_attempts stop erroring. |
| [Sentry](https://sentry.io) probe 403 | daily-checkin observability | watch | 2026-07-24 | — | `missing_observability`, auth failed. Resolve when Sentry probe returns 200 with issue data. |
| Front-door 522 flap → health-check RED | daily-health-check email | watch | 2026-07-24 | 1 flap | 522 on / /skills /guides at 22:00Z, 200 at 04:31Z. Single-shot check, no retry. Resolve when health check adds retry or 522 flaps stop. |
| `Test` CI workflow red every commit | GitHub Actions | watch | 2026-07-24 | ongoing | Deploy succeeds, Test fails; consecutiveFailures tracks deploy so reads 0. Resolve when Test job passes or is removed. |
