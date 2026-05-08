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

- `scripts/prototype-*.ts`: tsx entrypoints for local one-off runs against D1
  (`wrangler d1 execute`). Useful to eyeball quality before wiring a cron.
- Future: a [Cloudflare](https://cloudflare.com) cron-triggered Worker will iterate the `skills` table
  and dispatch to generators in chunks. Not built yet; prototype phase.
