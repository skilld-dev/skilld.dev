# Scheduled tasks

Generated from literal `defineScheduledTask` declarations. Run `pnpm cron:docs` after schedule changes.

Tasks: 17. Unique Cloudflare triggers: 14.

| Task | Cron | Source |
| --- | --- | --- |
| `ai-generate-poll` | `45 * * * *` | `layers/registry/server/tasks/ai-generate-poll.ts` |
| `ai-generate-submit` | `15 * * * *` | `layers/registry/server/tasks/ai-generate-submit.ts` |
| `ai-ready:cron` | `*/5 * * * *` | `server/tasks/ai-ready-cron.ts` |
| `backfill-skill-assets` | `*/5 * * * *` | `layers/registry/server/tasks/backfill-skill-assets.ts` |
| `detect-star-surges` | `30 4 * * *` | `layers/registry/server/tasks/detect-star-surges.ts` |
| `drain-skill-dirty` | `*/5 * * * *` | `layers/registry/server/tasks/drain-skill-dirty.ts` |
| `embedding-parity-audit` | `0 21 * * *` | `layers/registry/server/tasks/embedding-parity-audit.ts` |
| `recompute-skill-scores` | `0 3 * * *` | `layers/registry/server/tasks/recompute-skill-scores.ts` |
| `reconcile-rendered` | `20 */6 * * *` | `layers/registry/server/tasks/reconcile-rendered.ts` |
| `refresh-x-engagement` | `10 * * * *` | `layers/registry/server/tasks/refresh-x-engagement.ts` |
| `send-digests` | `0 9 1 * *` | `layers/identity/server/tasks/send-digests.ts` |
| `send-weekly` | `0 9 * * MON` | `layers/identity/server/tasks/send-weekly.ts` |
| `sync-bsky-mentions` | `17 */2 * * *` | `layers/registry/server/tasks/sync-bsky-mentions.ts` |
| `sync-github-skills` | `0 * * * *` | `layers/registry/server/tasks/sync-github-skills.ts` |
| `sync-reviewed-skill-repos` | `*/5 * * * *` | `layers/registry/server/tasks/sync-reviewed-skill-repos.ts` |
| `sync-social-mentions` | `30 * * * *` | `layers/registry/server/tasks/sync-social-mentions.ts` |
| `sync-x-mentions` | `*/15 * * * *` | `layers/registry/server/tasks/sync-x-mentions.ts` |
