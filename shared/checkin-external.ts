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
      prompt: `- X API lists $0.005 per Post and $0.010 per User. The accepted monthly line is $40, recorded in #160.
     - X usually deduplicates resource charges within each UTC day. This guarantee has exceptions: https://docs.x.com/x-api/getting-started/pricing.
     - \`x_over_budget\` true is AMBER: discovery exceeded its returned-read ceiling. Null means the ceiling evidence is unavailable.
     - \`x_projected_monthly_usd\` above 40 is AMBER; above 60 is RED. Report it as a conservative Post-only estimate. Actual billing and User expansion charges are unavailable.
     - \`x_falling_behind\` warns that fewer reads remain than X's minimum request size. Exhaustion alone does not prove unread results remain.
     - \`x_discovery_reads_today\` counts returned Posts, including repeated IDs. It is not billed usage.
     - \`x_observed_posts_today\` counts distinct X Posts observed by discovery or refresh within the current UTC day. It is not billed usage.
     - \`x_posts_24h\` counts newly stored Posts over a rolling 24 hours, including Posts without Repository links. These windows differ. Never infer discarded Posts or invoice charges from their gap.`,
    },
    {
      id: 'skilld.pulse',
      prompt: `Include a Pulse section with users, skills, repo changes, command copies split as run and install, digests, known AI cost, and X spend as "$X.XX/mo Post-only estimate (N/<x_budget_target> returned reads today)". State that actual billing is unavailable. Read these values from collected evidence. Include deploy and CI changes in Overnight. Include migration, schema, deploy SHA, stale task, and observability gaps in Drift.`,
    },
    {
      id: 'skilld.seo-recovery',
      prompt: `Add the SEO recovery section only when the run date is a Monday from 2026-10-12 through 2026-11-16. Take the run date from \`observedAt\` in Australia/Sydney. On any other date add nothing and do not mention this item.
Week number: 1 on 2026-10-12, then plus 1 each Monday. Read \`docs/work/EXECUTE-seo-recovery.md\` and \`docs/work/seo-recovery-panel.json\` first. They own the experiments, the panel groups, and the gate. If either file is missing, report one blocked line naming it.
Setup, read only:
   - Site ID \`s_08aae654\`. Run \`nuxtseo whoami --json\`. The token comes from \`NUXTSEO_TOKEN\` or the CLI login. If \`nuxtseo\` is absent or \`whoami\` fails, report one blocked line naming the missing binary or token. Propose nothing else. Never print the token.
   - Read the \`nuxtseo-cli\` Skill and its \`references/indexing.md\` first. Quote counts the CLI ships. Name \`asOf\`. Never mix datasets. Never call an indexed count current.
   - Use only reads: \`pull\`, \`search analytics timeseries\`, \`search analytics keywords --search skilld\`, \`search indexing summary\`, \`search indexing urls\`, and \`search inspect\`. Run \`backlinks referring-domains\` only if its evidence shows \`cache\` or \`no-provider\`, so it spends nothing.
   - Never scan, resolve, dismiss, annotate, submit a sitemap, or write to NuxtSEO, gscdump, or Search Console.
Report a compact "SEO recovery" section with:
   - Week number and the run date.
   - Clicks and impressions for 7d against the previous 7d and against the 2026-09-30 baseline in the brief. Say which dataset each figure came from.
   - The position of the brand query \`skilld\`.
   - Indexing summary: \`totalUrls\`, \`indexed\`, \`asOf\`, and the capture age in days. A null \`asOf\` means the capture time is unavailable.
   - For each panel group, the count of URLs at each rung: unknown, discovered, crawled, indexed. Read the panel URLs with \`search indexing urls\`. Read gscdump Watched URL checkpoints for the same URLs only if gscdump 4.6.0 or newer is installed and the panel is watched. Otherwise write "gscdump Watched URLs not available" and continue. Report Bing per-URL status only if gscdump holds Bing data for skilld. Otherwise say so.
   - Clean referring domains, excluding the 20 spam network domains named in the brief.
   - Each experiment's scale or kill rule from the brief, read as met, not met, or not yet readable. Give the evidence and the read date. Experiment B needs the \`b_linked\` group in the panel. Before that, it is not yet readable.
   - State that Search Console Crawl stats and the Pages report are not in any API. Ask Harlan for two screenshots: Crawl stats, and the Pages report "Why pages aren't indexed".
On 2026-11-09 and 2026-11-16 also add the gate decision table from the brief. Give each row the panel evidence and the result: stay, cut harder, or domain verdict. The brief dates the gate 2026-11-11. Label the read as the run date. Never treat the September 2026 spam update window as readable before 2026-10-12.`,
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
