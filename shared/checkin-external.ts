import type { ExternalOptions } from '@harlan-zw/nuxt-checkin/external'

export const externalCheckin = {
  required: ['skilld.baseline', 'skilld.git', 'skilld.deploy', 'skilld.ci', 'skilld.home', 'skilld.skills', 'skilld.database', 'skilld.workers', 'skilld.analytics', 'skilld.report', 'sentry.skilld', 'skilld.sentry-details'],
  prompts: [
    {
      id: 'skilld.operations',
      prompt: `Read check evidence from \`results\`: \`skilld.git\`, \`skilld.deploy\`, \`skilld.ci\`, \`skilld.database\`, and \`skilld.workers\`.
   Map the previous \`git\`, \`deploy\`, \`ci\`, \`d1\`, and \`workers\` fields to each result's \`result.evidence\`.
   Read detailed Sentry evidence from \`skilld.sentry-details\`. Read HTTP results from \`skilld.home\` and \`skilld.skills\`.
Interpret this site evidence:
   - \`skilld.report\` collects live protected health checks and verifies the current Worker version with a five-minute age limit.
   - Any stable non-200 \`skilld.dev\` front door response is RED. A retry flap is a note.
   - Read every \`ci.workflows\` state. \`failure\` means the gate is broken. \`pending\` after a prior failure must be followed until complete. \`missing\` is an observability gap. Never infer overall CI health from only the deploy workflow.
   - Any \`workers.nonOk\`, new Sentry issue, failed digest, failed job, stale reserved job, stale scheduled task, or missing expected table needs an explicit verdict.
   - \`d1.migrations.localHead !== d1.migrations.prodHead\` is migration drift. Never assume deployment applied D1 migrations.
   - \`skilld.baseline\` result evidence records the window against the daily cadence. \`stale\` means the saved baseline is old; report the \`gapHours\` figure and compare rates per day, never as overnight step changes. The shared CLI rejects invalid or future state before collecting evidence. Repair the state or supply an explicit \`--since\` boundary.
   - Use failed-job \`first_failed_at\` and \`last_failed_at\`, plus \`d1.recentJobBatches\` and \`d1.registryMaintenance\`, to distinguish an active incident from a recovered burst. Do not call a window clean because the latest batch passed, or active because an older batch failed.
   - \`d1.inventory.broken_repos\` is known cumulative inventory. Review \`d1.pipeline.newly_broken_repos_total\`, but gate health on \`d1.pipeline.newly_broken_repos_impacted\`. A source removal is impacting when it still backs a skill or appears in a star, subscription, or collection.
   - \`skilld.analytics\` holds command copies from Analytics Engine, which is the activation signal. Report \`commandCopies.run\` and \`commandCopies.install\` apart: a run copy reads a Skill once, an install copy keeps it. Analytics Engine samples, so treat a small day as a range, not an exact count.
   - AI cost is only the recorded batch estimate. Unmeasured services are unknown, not $0.`,
    },
    {
      id: 'skilld.spend',
      prompt: `- X API is pay-per-use at $0.005 per post read, with no included allowance and a $20/month target. Accepted 2026-08-31 at a projected $18.15/month, which raised the target from $10. Gate on \`d1.cost\`:
     - \`x_over_budget\` true is AMBER. The daily discovery budget failed to hold and the month will overrun.
     - \`x_projected_monthly_usd\` above 40 is AMBER, above 60 is RED, even when \`x_over_budget\` is false. Harlan raised the accepted line from $30 to $40 on 2026-09-07 (issue #160). Report the figure every run, not only when it breaches.
     - \`x_budget_used_pct\` at 100 on consecutive days means discovery is truncating. That is the designed steady state, not a fault. Say so rather than reporting it as a failure.
     - \`x_discovery_reads_today\` is the billed number. \`x_posts_24h\` counts only posts that survived repo extraction, so a large gap between them means the search query is paying for posts it discards. Flag a gap above 50% as a query-tuning action.`,
    },
    {
      id: 'skilld.pulse',
      prompt: `Include a Pulse section with users, skills, repo changes, command copies split as run and install, digests, known AI cost, and X spend as "$X.XX/mo projected (N/<x_budget_target> reads today)". Read these values from collected evidence. Include deploy and CI changes in Overnight. Include migration, schema, deploy SHA, stale task, and observability gaps in Drift.`,
    },
  ],
  credentials: {
    sentry: {
      env: 'SENTRY_AUTH_TOKEN',
      files: [
        { path: '~/.sentryclirc', key: 'token' },
        { path: '.env.sentry-build-plugin', key: 'SENTRY_AUTH_TOKEN' },
      ],
    },
  },
  timeoutMs: 180_000,
  totalTimeoutMs: 240_000,
  save: {
    dir: 'docs/ops/checkins',
    stateFile: 'state.json',
    timestampKey: 'lastRunAt',
    baseline: 'daily',
    defaultWindowMs: 86_400_000,
  },
} satisfies ExternalOptions
