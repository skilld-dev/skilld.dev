# Scheduled tasks

Generated from literal `defineScheduledTask` declarations. Run `pnpm cron:docs` after schedule changes.

Tasks: 11. Unique Cloudflare triggers: 8.

| Task | Cron | Source |
| --- | --- | --- |
| `ai-generate-poll` | `45 * * * *` | `layers/registry/server/tasks/ai-generate-poll.ts` |
| `ai-generate-submit` | `15 * * * *` | `layers/registry/server/tasks/ai-generate-submit.ts` |
| `ai-ready:cron` | `*/5 * * * *` | `server/tasks/ai-ready-cron.ts` |
| `backfill-skill-assets` | `*/5 * * * *` | `layers/registry/server/tasks/backfill-skill-assets.ts` |
| `daily-health-check` | `0 22 * * *` | `layers/identity/server/tasks/daily-health-check.ts` |
| `drain-skill-dirty` | `*/5 * * * *` | `layers/registry/server/tasks/drain-skill-dirty.ts` |
| `recompute-skill-scores` | `0 3 * * *` | `layers/registry/server/tasks/recompute-skill-scores.ts` |
| `reconcile-rendered` | `20 */6 * * *` | `layers/registry/server/tasks/reconcile-rendered.ts` |
| `send-digests` | `0 * * * *` | `layers/identity/server/tasks/send-digests.ts` |
| `sync-github-skills` | `0 * * * *` | `layers/registry/server/tasks/sync-github-skills.ts` |
| `sync-social-mentions` | `30 * * * *` | `layers/registry/server/tasks/sync-social-mentions.ts` |
