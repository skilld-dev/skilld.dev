/**
 * The review ledger: everything an external signal surfaced, and what we did
 * about it.
 *
 * Discovery auto-submits, so the ledger is not a gate in front of ingestion.
 * It is the record that makes auto-submission reviewable after the fact: every
 * repo X or HN pointed at, the evidence, and whether it turned into anything.
 * Without it, auto-ingest is a pipeline with no audit trail, and the only way
 * to find out what it admitted is to read the registry.
 *
 * The status machine, and who moves each edge:
 *
 *   pending   -> submitted   submitDiscoveredRepos, when the job is enqueued
 *   pending   -> gone        submitDiscoveredRepos, when GitHub no longer has it
 *   submitted -> indexed     reconcileLedger, once the repo resolved a skill
 *   submitted -> empty       reconcileLedger, once the job finished with none
 *   any       -> rejected    a human, via the admin surface
 *
 * `rejected` and `gone` are terminal. Discovery updates counters on such a row
 * but never resubmits it, so a repo turned down once does not come back every
 * time someone posts about it.
 *
 * The two terminal states name different deciders on purpose. `rejected` is a
 * person saying no. `gone` is GitHub saying the repository is not there, which
 * no review can overturn.
 */

import type { RegistryRepositorySubmissionJobPayload } from '~~/server/utils/registry-jobs-runtime'
import type { MeasureRepoSize } from './discovery-size-guard'
import { enqueueRegistryRepoJob } from '~~/server/utils/registry-jobs-runtime'
import { AUTO_INDEX_SKILL_LIMIT } from './discovery-size-guard'

export type LedgerStatus = 'pending' | 'submitted' | 'indexed' | 'empty' | 'rejected' | 'gone'
export type LedgerSource = 'x' | 'hn' | 'bsky'

/**
 * What the submit loop did with a row the last time it reached it.
 *
 * Distinct from `status` on purpose. `status` is where the repo is in the
 * pipeline; this is why it is still there. The three outcomes that leave a row
 * `pending` (`unmeasured`, `error`, and a `queued` write that failed) are
 * indistinguishable from "never reached" without it, and that ambiguity cost
 * sixteen hours of a stalled queue reading as normal throughput.
 */
export type AttemptOutcome
  = | 'queued'
    | 'duplicate'
    | 'oversized'
    | 'repo-gone'
    | 'unmeasured'
    | 'error'

export interface LedgerEntry {
  id: number
  source: LedgerSource
  owner: string
  repo: string
  evidenceUrl: string
  evidenceText: string
  evidenceScore: number
  firstSeenAt: number
  lastSeenAt: number
  mentionCount: number
  status: LedgerStatus
  submittedAt: number | null
  reviewedAt: number | null
  reviewNote: string | null
  /** Skills the guard measured, null until a repo has been sized. */
  skillCount: number | null
  /**
   * Non-null means the row is parked awaiting a person.
   *
   * Only reasons a person can act on belong here. A repository GitHub no
   * longer serves is terminal `gone` instead, because a reviewer who releases
   * it only enqueues a submission that 404s.
   */
  heldReason: string | null
}

interface LedgerRow {
  id: number
  source: LedgerSource
  owner: string
  repo: string
  evidence_url: string
  evidence_text: string
  evidence_score: number
  first_seen_at: number
  last_seen_at: number
  mention_count: number
  status: LedgerStatus
  submitted_at: number | null
  reviewed_at: number | null
  review_note: string | null
  skill_count: number | null
  held_reason: string | null
}

function toEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    source: row.source,
    owner: row.owner,
    repo: row.repo,
    evidenceUrl: row.evidence_url,
    evidenceText: row.evidence_text,
    evidenceScore: row.evidence_score,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    mentionCount: row.mention_count,
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    skillCount: row.skill_count,
    heldReason: row.held_reason,
  }
}

export interface ListLedgerOptions {
  db: D1Database
  status?: LedgerStatus | 'all'
  source?: LedgerSource | 'all'
  /**
   * `held` returns only parked rows, `submittable` only rows the submit loop
   * may still reach. Defaults to both, which is the archive view.
   */
  parked?: 'held' | 'submittable' | 'all'
  limit?: number
}

/**
 * Read the ledger, strongest evidence first within each source.
 *
 * INTERLEAVED BY SOURCE, for the same reason `submitDiscoveredRepos` and
 * `pickAnnouncements` are. `evidence_score` is comparable inside one source
 * and meaningless across sources: X scores run into the thousands, Bluesky's
 * ceiling is about 50, and Hacker News counts points. A plain global
 * `ORDER BY evidence_score DESC` ranks which platform inflates numbers most,
 * so every Bluesky row would sit below every X row and a reviewer working
 * top-down would never reach one.
 */
export async function listLedger(options: ListLedgerOptions): Promise<LedgerEntry[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (options.status && options.status !== 'all') {
    params.push(options.status)
    conditions.push(`status = ?${params.length}`)
  }
  if (options.source && options.source !== 'all') {
    params.push(options.source)
    conditions.push(`source = ?${params.length}`)
  }
  if (options.parked === 'held')
    conditions.push(`held_reason IS NOT NULL`)
  else if (options.parked === 'submittable')
    conditions.push(`held_reason IS NULL`)
  params.push(options.limit ?? 100)

  const rows = (await options.db
    .prepare(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY source ORDER BY evidence_score DESC, last_seen_at DESC
         ) AS source_rank
         FROM discovery_ledger
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       )
       ORDER BY source_rank ASC, evidence_score DESC, last_seen_at DESC
       LIMIT ?${params.length}`,
    )
    .bind(...params)
    .all<LedgerRow>()).results ?? []

  return rows.map(toEntry)
}

export interface LedgerCounts {
  pending: number
  submitted: number
  indexed: number
  empty: number
  rejected: number
  gone: number
}

export async function countLedgerByStatus(db: D1Database): Promise<LedgerCounts> {
  const rows = (await db
    .prepare(`SELECT status, COUNT(*) AS n FROM discovery_ledger GROUP BY status`)
    .all<{ status: LedgerStatus, n: number }>()).results ?? []
  const counts: LedgerCounts = { pending: 0, submitted: 0, indexed: 0, empty: 0, rejected: 0, gone: 0 }
  for (const row of rows)
    counts[row.status] = row.n
  return counts
}

export interface DiscoveredRepoEvidence {
  owner: string
  repo: string
  evidenceUrl: string
  evidenceText: string
  /**
   * Comparable within a source only. X uses weighted engagement, HN uses
   * points; the two scales are never compared against each other, and the
   * review list sorts inside a source filter for that reason.
   */
  evidenceScore: number
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/**
 * Record a discovery, or strengthen the evidence already on file.
 *
 * Shared by X and HN so both sources land in one reviewable list. Evidence is
 * kept at its high-water mark rather than its latest value: a repo that
 * trended once and later got a quiet mention should still present its best
 * case to a reviewer.
 * X counts stored post references, so cursor replays cannot add mentions.
 *
 * Returns whether this was the first sighting, which callers use to decide
 * whether to announce it. Existence is read before the write because D1
 * reports identical `changes` for an insert and an ON CONFLICT update, and
 * `last_row_id` carries over from earlier statements on the same connection,
 * so neither can distinguish the two.
 */
export async function upsertLedgerEntry(input: {
  db: D1Database
  source: LedgerSource
  repo: DiscoveredRepoEvidence
  now: number
}): Promise<'inserted' | 'updated'> {
  const { db, source, repo, now } = input

  const existing = await db
    .prepare(`SELECT 1 AS found FROM discovery_ledger WHERE source = ?1 AND owner = ?2 AND repo = ?3`)
    .bind(source, repo.owner, repo.repo)
    .first<{ found: number }>()

  await db
    .prepare(
      `INSERT INTO discovery_ledger (
         source, owner, repo, evidence_url, evidence_text, evidence_score,
         first_seen_at, last_seen_at, mention_count, status
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7,
         CASE WHEN ?1 = 'x' THEN (
           SELECT COUNT(*) FROM x_post_repos WHERE owner = ?2 AND repo = ?3
         ) ELSE 1 END, 'pending')
       ON CONFLICT (source, owner, repo) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         mention_count = CASE WHEN excluded.source = 'x'
           THEN excluded.mention_count
           ELSE discovery_ledger.mention_count + 1 END,
         evidence_url = CASE
           WHEN excluded.evidence_score > discovery_ledger.evidence_score
             THEN excluded.evidence_url ELSE discovery_ledger.evidence_url END,
         evidence_text = CASE
           WHEN excluded.evidence_score > discovery_ledger.evidence_score
             THEN excluded.evidence_text ELSE discovery_ledger.evidence_text END,
         evidence_score = MAX(discovery_ledger.evidence_score, excluded.evidence_score)`,
    )
    .bind(
      source,
      repo.owner,
      repo.repo,
      repo.evidenceUrl,
      truncate(repo.evidenceText, 500),
      repo.evidenceScore,
      now,
    )
    .run()

  return existing ? 'updated' : 'inserted'
}

export interface SubmitDeps {
  db: D1Database
  env: Cloudflare.Env & Record<string, unknown>
  now: number
  /** Ceiling on jobs enqueued per run, so a discovery spike cannot flood the queue. */
  limit?: number
  /**
   * Injected so the submission path is testable without the jobs runtime.
   * Defaults to the real `registry/repository-submission` enqueue.
   */
  enqueue?: (
    env: SubmitDeps['env'],
    payload: RegistryRepositorySubmissionJobPayload,
  ) => Promise<{ jobId: string, status: 'queued' | 'duplicate' }>
  /**
   * Skill-count check run before a repo is submitted. Omit it and nothing is
   * submitted at all: an unmeasured repo is never auto-indexed, because the
   * whole point of the guard is that one aggregator dump must not reach the
   * registry unseen.
   */
  measureRepoSize?: MeasureRepoSize
  /** Skills above which a repo is parked for review. */
  skillLimit?: number
}

export interface SubmitSummary {
  considered: number
  queued: number
  duplicate: number
  failed: number
  /** Parked because the repo holds more skills than the guard allows. */
  heldOversized: number
  /**
   * Submitted over the skill limit because a person released the hold.
   *
   * Counted separately from `queued` so the run log names the deliberate act.
   * A 202-skill repo entering the registry is the largest single thing this
   * pipeline does, and it should never be indistinguishable from an ordinary
   * three-skill submission in the archive.
   */
  admittedOversized: number
  /** Closed as `gone` because the repo no longer exists on GitHub. */
  goneClosed: number
  /** Deferred because size could not be measured; retried next run. */
  deferredUnmeasured: number
  /**
   * First exception message this run, so the task summary names the cause
   * rather than only counting failures.
   */
  lastError: string | null
  /** True when `limit` stopped the run with pending rows still waiting. */
  truncated: boolean
}

const DEFAULT_SUBMIT_LIMIT = 25

/**
 * Enqueue indexing for pending discoveries, strongest evidence first.
 *
 * Ordering by evidence matters when the limit bites: the repo three people are
 * posting about should be indexed this cycle, not the one that got a single
 * mention. Rows are marked `submitted` only after the enqueue returns, so a
 * failure leaves the row pending and the next run retries it.
 */
export async function submitDiscoveredRepos(deps: SubmitDeps): Promise<SubmitSummary> {
  const limit = deps.limit ?? DEFAULT_SUBMIT_LIMIT
  const enqueue = deps.enqueue ?? enqueueRegistryRepoJob

  const skillLimit = deps.skillLimit ?? AUTO_INDEX_SKILL_LIMIT
  const measure = deps.measureRepoSize

  // Fetch one extra to detect that more work remains without a second query.
  // Parked rows are excluded: they are waiting on a person, and re-measuring
  // them every quarter hour would spend GitHub calls to reach the same answer.
  //
  // RANKED WITHIN SOURCE, THEN INTERLEAVED. `evidence_score` is comparable
  // inside one source and meaningless across sources: X scores run into the
  // thousands, Bluesky's ceiling is about 50, and Hacker News counts points.
  // A plain global `ORDER BY evidence_score DESC` therefore does not rank
  // strength, it ranks which platform inflates numbers most, and every
  // Bluesky row would sit below every X row forever, starved by the per-run
  // limit and never submitted.
  //
  // Ranking inside each source and taking rank 1 of each, then rank 2, and so
  // on gives every source a fair share of each run while still submitting each
  // source's strongest evidence first.
  const rows = (await deps.db
    .prepare(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY source ORDER BY evidence_score DESC, last_seen_at DESC
         ) AS source_rank
         FROM discovery_ledger
         WHERE status = 'pending' AND held_reason IS NULL
       )
       ORDER BY source_rank ASC, evidence_score DESC, last_seen_at DESC
       LIMIT ?1`,
    )
    .bind(limit + 1)
    .all<LedgerRow>()).results ?? []

  const summary: SubmitSummary = {
    considered: Math.min(rows.length, limit),
    queued: 0,
    duplicate: 0,
    failed: 0,
    heldOversized: 0,
    admittedOversized: 0,
    goneClosed: 0,
    deferredUnmeasured: 0,
    lastError: null,
    truncated: rows.length > limit,
  }

  for (const row of rows.slice(0, limit)) {
    // Every branch below writes through this, including the two that leave the
    // row exactly as they found it. `assignments` carries whatever else that
    // branch changes, so recording an attempt never costs a second D1 write.
    const record = (
      outcome: AttemptOutcome,
      detail: string | null,
      assignments: string = '',
      extra: unknown[] = [],
    ) => deps.db
      .prepare(
        `UPDATE discovery_ledger
         SET last_attempt_at = ?2, last_attempt_outcome = ?3, last_attempt_detail = ?4${assignments}
         WHERE id = ?1`,
      )
      .bind(row.id, deps.now, outcome, detail, ...extra)
      .run()

    try {
      // Fail closed. No sizer, or a sizer that could not answer, means the
      // repo waits. An expired GitHub token is the likely cause, and treating
      // that as "small enough" would wave every aggregator straight through.
      const verdict = measure
        ? await measure({ owner: row.owner, repo: row.repo })
        : { _tag: 'unknown' as const, reason: 'no-sizer-configured' }

      if (verdict._tag === 'gone') {
        // Close it rather than retry forever. A deleted repo is a permanent
        // answer, and leaving it pending would burn a GitHub call every run.
        //
        // CLOSED, NOT PARKED. This used to set `held_reason`, which put the row
        // in the reviewer's queue, and 24 of the 67 rows parked there on
        // 2026-08-17 were repositories nobody could do anything about. Neither
        // available action fits: releasing enqueues a submission that 404s, and
        // rejecting records a human verdict on GitHub's decision.
        summary.goneClosed += 1
        await record('repo-gone', null, `, status = 'gone'`)
        continue
      }

      if (verdict._tag === 'unknown') {
        // WAS THE SILENT ONE. The row stays pending, which is right, and used
        // to stay identical, which meant a repo could be re-measured every
        // fifteen minutes forever with nothing anywhere saying so. The sizer's
        // reason is the whole diagnosis: `tree-403` is a rate limit,
        // `repo-summary-401` an expired token, `tree-truncated` a repo too big
        // to count.
        summary.deferredUnmeasured += 1
        await record('unmeasured', verdict.reason)
        emitOperationalEvent(createWideEvent({
          operation: 'discovery-ledger-size',
          outcome: 'unknown',
          reason: verdict.reason,
          repo: `${row.owner}/${row.repo}`,
        }))
        continue
      }

      // ADMITTED ROWS SKIP THE SIZE CHECK, AND ONLY ADMITTED ROWS DO.
      //
      // A released hold is a repo a person looked at and said yes to. Without
      // this branch the release is futile: the row comes back through here on
      // the next tick, measures the same 202 skills, and is parked again with
      // the same `oversized` reason, so the admin surface would clear a hold
      // that reappears fifteen minutes later with nothing saying why.
      //
      // `reviewed_at` is the admission. Nothing sets it except a human acting
      // through the review surface (`releaseLedgerHold`, `reviewLedgerEntry`),
      // so the guard still holds its actual promise: no oversized repo reaches
      // the registry without a named person having admitted it. A repo that
      // was never reviewed still has `reviewed_at IS NULL` and still parks.
      const admittedByHuman = row.reviewed_at !== null

      if (verdict.skillCount > skillLimit && !admittedByHuman) {
        summary.heldOversized += 1
        await record(
          'oversized',
          `${verdict.skillCount} skills`,
          `, skill_count = ?5, held_reason = 'oversized'`,
          [verdict.skillCount],
        )
        continue
      }

      if (verdict.skillCount > skillLimit)
        summary.admittedOversized += 1

      const result = await enqueue(deps.env, {
        operation: 'submit',
        owner: row.owner,
        repo: row.repo,
      })
      if (result.status === 'duplicate')
        summary.duplicate += 1
      else
        summary.queued += 1

      await record(
        result.status,
        null,
        `, status = 'submitted', submitted_at = ?2, skill_count = ?5`,
        [verdict.skillCount],
      )
    }
    catch (error) {
      // WAS THE OTHER SILENT ONE, and it swallowed the error without binding
      // it. Left pending on purpose: the next run retries. The message is now
      // kept on the row, because a throw that repeats every run is a bug and
      // the exception text is the only thing that names it.
      summary.failed += 1
      const detail = error instanceof Error ? error.message : String(error)
      summary.lastError ??= detail
      emitOperationalEvent(createWideEvent({
        operation: 'discovery-ledger-submit',
        outcome: 'failed',
        reason: detail,
        repo: `${row.owner}/${row.repo}`,
      }))
      // A failure to record leaves the row silent, which is the exact hole
      // this closes, so it is reported rather than nested-caught into nothing.
      await record('error', detail).catch(() => {
        emitOperationalEvent(createWideEvent({
          operation: 'discovery-ledger-record',
          outcome: 'failed',
          repo: `${row.owner}/${row.repo}`,
        }))
      })
    }
  }

  return summary
}

export interface ReconcileSummary {
  indexed: number
  empty: number
  /** Submitted long ago with no finished job. Visible, never auto-emptied. */
  stalled: number
  /**
   * Returned to `pending` because the verdict that stranded them came from
   * indexer code that has since been deleted.
   */
  retried: number
}

/**
 * Close out submitted rows against what the registry actually holds.
 *
 * `empty` REQUIRES POSITIVE EVIDENCE. An earlier version marked any row
 * submitted more than six hours ago as empty, on the assumption that a repo
 * with no skills by then had none to find. That is not what the elapsed time
 * means: it also covers a queue that has not drained, and `empty` is terminal,
 * so the row was never retried.
 *
 * The damage was real. `cathrynlavery/diagram-design` (13,254 stars, one
 * SKILL.md), `aashaexo/soundshuman`, `vikingmute/review-forge` and
 * `simoneavogadro/android-reverse-engineering-skill` were all marked empty
 * while their indexing jobs sat unstarted, and all four are exactly the
 * high-engagement repos the trending page exists to surface.
 *
 * A row is now only emptied when its submission job actually finished and the
 * registry still holds nothing. Rows whose job has not completed stay
 * `submitted` and are reported as `stalled`, because absence of information is
 * not evidence of absence.
 */
export async function reconcileLedger(input: {
  db: D1Database
  now: number
  /** Age past which an unfinished submission is reported as stalled. */
  stalledAfterSeconds?: number
}): Promise<ReconcileSummary> {
  const stalledAfter = input.stalledAfterSeconds ?? 6 * 3600

  const indexed = await input.db
    .prepare(
      `UPDATE discovery_ledger SET status = 'indexed'
       WHERE status = 'submitted'
         AND EXISTS (
           SELECT 1 FROM skills s
           WHERE s.owner = discovery_ledger.owner
             AND s.repo = discovery_ledger.repo
             AND s.source_resolved = 1
         )`,
    )
    .run()

  // A DEAD-LETTERED JOB IS A FINISHED JOB. It leaves no row in `jobs` at all,
  // so the completed-job test below could never see it, and 42 rows sat
  // `submitted` forever while the health check reported them as stalled.
  //
  // Measured in production on 2026-08-16: every one of the 42 was already in
  // `repos` with `repo_skill_count = 0`, and the dead-letters split two ways,
  // 62 `no_supported_skill_paths` against 12 `root_skill_unsupported`. Only
  // the first is an answer about the repository. The second is an answer about
  // our own indexer, handled below.
  //
  // `unique_key` is hashed, so both joins go through the payload, which carries
  // owner and repo verbatim.
  const empty = await input.db
    .prepare(
      `UPDATE discovery_ledger SET status = 'empty'
       WHERE status = 'submitted'
         AND (
           EXISTS (
             SELECT 1 FROM jobs j
             WHERE j.job_type = 'registry/repository-submission'
               AND j.completed_at IS NOT NULL
               AND LOWER(json_extract(j.payload, '$.owner')) = discovery_ledger.owner
               AND LOWER(json_extract(j.payload, '$.repo')) = discovery_ledger.repo
           )
           OR EXISTS (
             SELECT 1 FROM failed_jobs f
             WHERE f.job_type = 'registry/repository-submission'
               AND f.exception LIKE '%no_supported_skill_paths%'
               AND LOWER(json_extract(f.payload, '$.owner')) = discovery_ledger.owner
               AND LOWER(json_extract(f.payload, '$.repo')) = discovery_ledger.repo
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM skills s
           WHERE s.owner = discovery_ledger.owner
             AND s.repo = discovery_ledger.repo
             AND s.source_resolved = 1
         )`,
    )
    .run()

  // `root_skill_unsupported` was the indexer refusing a repository whose
  // SKILL.md sits at the root. bcc8213 deleted that refusal, so the verdict
  // describes code that no longer exists and the rows it stranded are ordinary
  // repositories the registry should hold.
  //
  // They go back to `pending`, not to `indexed`. The size guard still has to
  // measure them, and `submitted_at` is cleared so a retried row cannot report
  // itself stalled on the strength of its first attempt.
  const retried = await input.db
    .prepare(
      `UPDATE discovery_ledger SET status = 'pending', submitted_at = NULL
       WHERE status = 'submitted'
         AND EXISTS (
           SELECT 1 FROM failed_jobs f
           WHERE f.job_type = 'registry/repository-submission'
             AND f.exception LIKE '%root_skill_unsupported%'
             AND LOWER(json_extract(f.payload, '$.owner')) = discovery_ledger.owner
             AND LOWER(json_extract(f.payload, '$.repo')) = discovery_ledger.repo
         )
         AND NOT EXISTS (
           SELECT 1 FROM skills s
           WHERE s.owner = discovery_ledger.owner
             AND s.repo = discovery_ledger.repo
             AND s.source_resolved = 1
         )`,
    )
    .run()

  const stalled = await input.db
    .prepare(
      `SELECT COUNT(*) AS n FROM discovery_ledger
       WHERE status = 'submitted'
         AND submitted_at IS NOT NULL
         AND submitted_at < ?1`,
    )
    .bind(input.now - stalledAfter)
    .first<{ n: number }>()

  return {
    indexed: changedRows(indexed),
    empty: changedRows(empty),
    retried: changedRows(retried),
    stalled: stalled?.n ?? 0,
  }
}

export interface AnnouncementCandidate {
  id: number
  /** Which network surfaced it. Decides how the score should be read. */
  source: LedgerSource
  owner: string
  repo: string
  evidenceUrl: string
  evidenceText: string
  evidenceScore: number
}

/**
 * Repos worth telling a channel about: indexed, never announced, and past the
 * evidence threshold.
 *
 * The threshold is what separates a notification from a firehose. Discovery
 * sees on the order of 80 repos a day; announcing all of them would train the
 * channel to ignore the bot inside a week.
 */
export async function pickAnnouncements(input: {
  db: D1Database
  /**
   * Threshold per source. A single number cannot work: X's floor of 300 would
   * silence Bluesky permanently, since the highest-scoring Bluesky post
   * measured in a 30-day window reached 20, while Bluesky's floor of 50 would
   * turn the channel into a firehose of X noise. A source with no entry here
   * never announces, so adding a source is a deliberate act rather than an
   * accident of defaulting.
   */
  minEvidenceScoreBySource: Partial<Record<LedgerSource, number>>
  limit?: number
}): Promise<AnnouncementCandidate[]> {
  const entries = Object.entries(input.minEvidenceScoreBySource)
    .filter((e): e is [LedgerSource, number] => typeof e[1] === 'number')
  if (entries.length === 0)
    return []

  const params: unknown[] = []
  const clauses = entries.map(([source, min]) => {
    params.push(source, min)
    return `(source = ?${params.length - 1} AND evidence_score >= ?${params.length})`
  })
  params.push(input.limit ?? 10)

  // Interleaved by source for the same reason the submit path is: ordering the
  // survivors by raw score across sources would let X fill the whole limit and
  // starve a Bluesky repo that cleared its own, much harder, bar.
  const rows = (await input.db
    .prepare(
      `SELECT id, source, owner, repo, evidence_url, evidence_text, evidence_score
       FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY source ORDER BY evidence_score DESC
         ) AS source_rank
         FROM discovery_ledger
         WHERE status = 'indexed'
           AND announced_at IS NULL
           AND (${clauses.join(' OR ')})
       )
       ORDER BY source_rank ASC, evidence_score DESC
       LIMIT ?${params.length}`,
    )
    .bind(...params)
    .all<{
    id: number
    source: LedgerSource
    owner: string
    repo: string
    evidence_url: string
    evidence_text: string
    evidence_score: number
  }>()).results ?? []

  return rows.map(r => ({
    id: r.id,
    source: r.source,
    owner: r.owner,
    repo: r.repo,
    evidenceUrl: r.evidence_url,
    evidenceText: r.evidence_text,
    evidenceScore: r.evidence_score,
  }))
}

/**
 * Mark announcements as delivered.
 *
 * Called only after the notifier reports success. Marking before delivery
 * would lose a repo permanently whenever Discord returned an error, and these
 * are exactly the repos worth not losing.
 */
export async function markAnnounced(input: {
  db: D1Database
  ids: number[]
  now: number
}): Promise<void> {
  if (input.ids.length === 0)
    return
  const placeholders = input.ids.map((_, i) => `?${i + 2}`).join(', ')
  await input.db
    .prepare(`UPDATE discovery_ledger SET announced_at = ?1 WHERE id IN (${placeholders})`)
    .bind(input.now, ...input.ids)
    .run()
}

function changedRows(result: { meta: unknown }): number {
  return (result.meta as { changes?: number } | undefined)?.changes ?? 0
}

/**
 * The row the caller named was not there to change.
 *
 * Both writers below match on more than the id, so "no row updated" is a real
 * answer the caller has to handle: the hold was already cleared by someone
 * else, or the row left `pending` while the reviewer had the page open. A void
 * return would report that as success and the reviewer would watch the entry
 * reappear on the next refresh with no explanation.
 */
export type LedgerWriteResult
  = | { _tag: 'ok' }
    | { _tag: 'no-matching-row' }

/**
 * Release a parked repo so the next submit run picks it up.
 *
 * The counterpart to the size guard: a human has looked at a large repo and
 * decided the registry wants it after all. Clearing `held_reason` is the only
 * way back into the submit queue, so nothing oversized is ever indexed without
 * someone having said yes.
 */
export async function releaseLedgerHold(input: {
  db: D1Database
  id: number
  reviewedBy: string
  note?: string | null
  now: number
}): Promise<LedgerWriteResult> {
  const result = await input.db
    .prepare(
      `UPDATE discovery_ledger
       SET held_reason = NULL, reviewed_at = ?2, reviewed_by = ?3, review_note = ?4
       WHERE id = ?1 AND status = 'pending' AND held_reason IS NOT NULL`,
    )
    .bind(input.id, input.now, input.reviewedBy, input.note ?? null)
    .run()

  return changedRows(result) > 0 ? { _tag: 'ok' } : { _tag: 'no-matching-row' }
}

/** Record a human decision. `rejected` is terminal for discovery. */
export async function reviewLedgerEntry(input: {
  db: D1Database
  id: number
  status: Extract<LedgerStatus, 'rejected' | 'pending'>
  reviewedBy: string
  note?: string | null
  now: number
}): Promise<LedgerWriteResult> {
  const result = await input.db
    .prepare(
      `UPDATE discovery_ledger
       SET status = ?2, reviewed_at = ?3, reviewed_by = ?4, review_note = ?5
       WHERE id = ?1`,
    )
    .bind(input.id, input.status, input.now, input.reviewedBy, input.note ?? null)
    .run()

  return changedRows(result) > 0 ? { _tag: 'ok' } : { _tag: 'no-matching-row' }
}
