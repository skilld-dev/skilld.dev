# server/jobs

Batch-derivation jobs that read source state (SKILL.md, endorsements) and write
derived content to D1 (`skill_generated`) or KV. Designed to run on a schedule,
not per-request. Each job is pure: give it `{ db, skill, raw, sha }`, get
back a payload row, no I/O beyond the storage helpers.

## Conventions

- One file per kind. Export a `generate*` function plus a batch runner.
- All generators take `(ctx, skill)` where `ctx` holds `{ db, apiKey, now }`.
- Writes go through `server/utils/skill-generated.ts` so invalidation keys stay
  consistent (`(owner, name, kind)` PK, `sha` for drift detection).
- Skip work if stored `sha` matches current SKILL.md `sha`. Idempotent by design.

## Runners

Current generation schedules belong to [the cron reference](../../../../docs/arch/cron.md).
Read `../tasks/ai-generate-submit.ts` for batch submission and `../tasks/ai-generate-poll.ts` for collection.
Local prototype scripts remain in Git history.
