import type { ExternalOptions } from '@harlan-zw/nuxt-checkin/external'

export const externalCheckin = {
  required: ['skilld.baseline', 'skilld.git', 'skilld.deploy', 'skilld.ci', 'skilld.home', 'skilld.skills', 'skilld.database', 'skilld.workers', 'skilld.analytics', 'skilld.report', 'sentry.skilld', 'skilld.sentry-details', 'skilld.signing-key'],
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
   - \`skilld.analytics\` holds command copies from Analytics Engine, which is the activation signal. Report \`commandCopies.run\` and \`commandCopies.install\` apart: a run copy reads a Skill once, an install copy keeps it. Analytics Engine samples, so treat a small day as a range, not an exact count. \`signup.stages\` counts sign-in and setup events by entry and outcome. These are attempts, not unique users or a joined conversion funnel. Report failures and email opt-outs separately. Missing events cannot prove abandonment.
   - \`skilld.signing-key\` Warn or Fail means Artifact signing ends soon. Quote \`signingEndsAt\` and \`daysLeft\`, and point to \`docs/runbooks/signing-key-rotation.md\`. After that date every \`skilld run\` fails.
   - AI cost is only the recorded batch estimate. Unmeasured services are unknown, not $0.`,
    },
    {
      id: 'skilld.spend',
      prompt: `- X API lists $0.005 per Post and $0.010 per User. The accepted monthly line is $40, recorded in #160.
     - X usually deduplicates resource charges within each UTC day. This guarantee has exceptions: https://docs.x.com/x-api/getting-started/pricing.
     - \`x_over_budget\` true is AMBER: discovery exceeded its returned-read ceiling. Null means the ceiling evidence is unavailable.
     - \`x_projected_monthly_usd\` above 40 is AMBER; above 60 is RED. Report it as a conservative Post-only estimate. Actual billing and User expansion charges are unavailable.
     - \`x_falling_behind\` warns that fewer reads remain than X's minimum request size. Exhaustion alone does not prove unread results remain.
     - If \`x_budget_used_pct\` reaches 100 on consecutive days, check continuation, cursor progress, and repeated pages. A catch-up burst does not establish the steady rate.
     - \`x_discovery_reads_today\` counts returned Posts, including repeated IDs. It is not billed usage.
     - \`x_observed_posts_today\` counts distinct X Posts observed by discovery or refresh within the current UTC day. It is not billed usage.
     - \`x_posts_24h\` counts newly stored Posts over a rolling 24 hours, including Posts without Repository links. These windows differ. Never infer discarded Posts or invoice charges from their gap. Check continuation and cursor progress before proposing query tuning.`,
    },
    {
      id: 'skilld.pulse',
      prompt: `Include a Pulse section with users, skills, repo changes, command copies split as run and install, digests, known AI cost, and X spend as "$X.XX/mo Post-only estimate (N/<x_budget_target> returned reads today)". State that actual billing is unavailable. Read these values from collected evidence. Include deploy and CI changes in Overnight. Include migration, schema, deploy SHA, stale task, and observability gaps in Drift.`,
    },
    {
      id: 'skilld.seo-recovery',
      prompt: `Add the SEO recovery section only when the run date is a Monday from 2026-10-12 through 2026-11-16. Take the run date from \`observedAt\` in Australia/Sydney. On any other date add nothing and do not mention this item.
Week number: 1 on 2026-10-12, then plus 1 each Monday. Read \`docs/work/EXECUTE-seo-recovery.md\` and \`docs/work/seo-recovery-panel.json\` first. They own the experiments, the panel groups, and the gate. If either file is missing, report one blocked line naming it.
The 07:40 daily run precedes the expected Monday inspections. Before 09:00 Australia/Sydney, label this section provisional. Request a read after 09:00; do not wait or schedule another run. After 09:00, still check each Checkpoint date before using it as this week's evidence.
Setup, read only:
   - Site ID \`s_08aae654\`. Run \`nuxtseo whoami --json\`. The token comes from \`NUXTSEO_TOKEN\` or the CLI login. If \`nuxtseo\` is absent or \`whoami\` fails, report one blocked line naming the missing binary or token. Propose nothing else. Never print the token.
   - Read the \`nuxtseo-cli\` Skill and its command, protocol, and indexing references first. Require CLI 0.5.8 or newer for these reads. Follow its version and Skill checks. Pass \`--site s_08aae654 --json\` on every Site read.
   - Use only reads: \`pull\`, \`search analytics timeseries\`, \`search analytics keywords --search skilld\`, \`search indexing summary\`, \`search indexing urls\`, \`search inspect\`, \`search watches\`, \`sitemaps submission\`, and \`sitemaps inspect\`. Run the last three separately; CLI 0.5.8 \`pull\` omits them. Use \`--period 7d\` for both analytics reads. Quote counts the CLI ships. Never mix datasets or call retained indexing counts current.
   - Never scan, resolve, dismiss, annotate, submit or delete a sitemap, or write to NuxtSEO, gscdump, or Search Console. Never pass \`--fresh\` or \`--yes\`. Use only retained backlink evidence already available; do not start research reads to discover whether they spend quota.
Report a compact "SEO recovery" section with:
   - Week number and the run date.
   - Clicks and impressions for 7d against the previous 7d and against the 2026-09-30 baseline in the brief. Say which dataset each figure came from.
   - The position of the brand query \`skilld\`.
   - Indexing summary: \`totalUrls\`, \`indexed\`, \`oldestCheckAt\`, \`asOf\`, and capture age in days. Include \`verdictFreshness\` when present. A null \`asOf\` means the capture time is unavailable.
   - Run \`search watches\` and match exact URLs against every panel group. Report missing watches, extra watches, and watches without Checkpoints separately. Never infer enrollment from an indexing URL list. For each matched URL, select the latest Checkpoint by \`checkedAt\`; retain its \`coverageState\`, \`googleCoverageState\`, \`lastCrawlTime\`, and the watch's \`dueAt\`.
   - Group those retained verdicts by the panel groups. Report unknown, discovered, crawled, and indexed counts. Preserve other states such as noindex, redirects, and not-found separately. Missing evidence is unavailable, never unknown to Google. Keep summary totals separate from panel counts.
   - Separate Checkpoints dated this Monday in Australia/Sydney from older Checkpoints. Report older verdicts as last known, with dates. Show each pending or overdue watch's \`dueAt\`. An elapsed due time never proves an inspection ran. A future due time does not make an older Checkpoint fresh. A missing or older Checkpoint leaves that URL's weekly measurement incomplete. The comparison can follow a Thursday cadence; never force a fresh inspection to align it.
   - Read \`sitemaps submission\` for Site-level state and \`callerCanAct\`. Inspect \`https://skilld.dev/__sitemap__/retired-0.xml --engine google\` and \`https://skilld.dev/sitemap_index.xml --engine bing\` with \`sitemaps inspect\`. Quote each exact URL, state, capture source, capture time, and provider submission and download dates. Keep Google's live read separate from Bing's stored capture. Missing and unavailable are different results. Listing never proves Page indexing. Report each failed read's exit code and request ID. Never report a missing Sitemap from a failed read or try another transport.
   - Bing per-URL indexing and clean referring domains: use separately dated retained evidence only. Sitemap listing proves neither. If unavailable, say so. Exclude the 20 spam network domains from referring-domain counts.
   - Report \`quality_excluded\` separately. Exclude its URLs from active recovery totals, experiment scale or kill decisions, and content or domain verdicts. Recheck quality eligibility. Report any change with its observation date; preserve earlier observations in their original group.
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
