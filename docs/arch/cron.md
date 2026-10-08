# Scheduled tasks

Generated from literal `defineScheduledTask` declarations. Run `pnpm cron:docs` after schedule changes.

Tasks: 24. Unique Cloudflare triggers: 15.

| Task | Cron | Source |
| --- | --- | --- |
| `admit-trending-skills` | `0 * * * *` | `layers/registry/server/tasks/admit-trending-skills.ts` |
| `ai-generate-poll` | `45 * * * *` | `layers/registry/server/tasks/ai-generate-poll.ts` |
| `ai-generate-submit` | `15 * * * *` | `layers/registry/server/tasks/ai-generate-submit.ts` |
| `ai-ready:cron` | `*/5 * * * *` | `server/tasks/ai-ready-cron.ts` |
| `backfill-skill-assets` | `*/5 * * * *` | `layers/registry/server/tasks/backfill-skill-assets.ts` |
| `classify-repository-purpose` | `0 * * * *` | `layers/registry/server/tasks/classify-repository-purpose.ts` |
| `cleanup-auto-index-rate-limits` | `0 * * * *` | `layers/registry/server/tasks/cleanup-auto-index-rate-limits.ts` |
| `detect-star-surges` | `30 4 * * *` | `layers/registry/server/tasks/detect-star-surges.ts` |
| `drain-skill-dirty` | `*/5 * * * *` | `layers/registry/server/tasks/drain-skill-dirty.ts` |
| `embedding-parity-audit` | `0 21 * * *` | `layers/registry/server/tasks/embedding-parity-audit.ts` |
| `purge-personal-data` | `30 4 * * *` | `layers/identity/server/tasks/purge-personal-data.ts` |
| `recompute-skill-scores` | `0 3 * * *` | `layers/registry/server/tasks/recompute-skill-scores.ts` |
| `reconcile-rendered` | `20 */6 * * *` | `layers/registry/server/tasks/reconcile-rendered.ts` |
| `record-trending-awards` | `0 * * * *` | `layers/registry/server/tasks/record-trending-awards.ts` |
| `refresh-x-engagement` | `10 * * * *` | `layers/registry/server/tasks/refresh-x-engagement.ts` |
| `scheduled-cadence-watchdog` | `*/5 * * * *` | `server/tasks/scheduled-cadence-watchdog.ts` |
| `send-digests` | `0 9 1 * *` | `layers/identity/server/tasks/send-digests.ts` |
| `send-weekly` | `0 9 * * MON` | `layers/identity/server/tasks/send-weekly.ts` |
| `sweep-skill-runs` | `7,22,37,52 * * * *` | `layers/artifact-delivery/server/tasks/sweep-skill-runs.ts` |
| `sync-bsky-mentions` | `17 */2 * * *` | `layers/registry/server/tasks/sync-bsky-mentions.ts` |
| `sync-github-skills` | `0 * * * *` | `layers/registry/server/tasks/sync-github-skills.ts` |
| `sync-reviewed-skill-repos` | `*/5 * * * *` | `layers/registry/server/tasks/sync-reviewed-skill-repos.ts` |
| `sync-social-mentions` | `30 * * * *` | `layers/registry/server/tasks/sync-social-mentions.ts` |
| `sync-x-mentions` | `*/15 * * * *` | `layers/registry/server/tasks/sync-x-mentions.ts` |
