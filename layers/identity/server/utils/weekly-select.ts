/// <reference types="@cloudflare/workers-types" />

/**
 * What goes in one person's weekly email.
 *
 * Two halves with different shapes. The liked half is per-person and comes
 * from `skill_likes` joined against `activity`. The trending half is the same
 * for everyone, so it is loaded once per run and handed in rather than
 * re-queried per recipient.
 */

import type {
  WeeklyLikedChange,
  WeeklyReason,
  WeeklyTrendingSkill,
} from './weekly-template'
import { loadFallbackSkills } from '#shared/server/trending-fallback'
import { loadTopStarredRepositories } from '#shared/server/trending-repos'
import { DEFAULT_WINDOW_HOURS, loadTrendingSkills } from '#shared/server/trending-skills'

/** Liked skills listed by name. Beyond this the email stops being scannable. */
export const MAX_LIKED_CHANGES = 5

/**
 * Trending rows carried into the email.
 *
 * Fewer than the board shows on purpose: an email is read in one pass and a
 * thirty-row leaderboard in an inbox is a page, not a message. Seven is the
 * most that still scans in one pass, and it matters more now that the liked
 * section no longer pads the email with the reader's own repositories.
 */
export const MAX_TRENDING = 7

/**
 * How many liked changes we count before giving up on an exact overflow number.
 *
 * The email says "+N more", so the number has to be real. Past this the query
 * would be paying to be precise about a number nobody reads.
 */
const LIKED_SCAN_LIMIT = 50

export interface WeeklyRecipient {
  id: number
  login: string
  /** Verified digest address, preferred over the GitHub profile address. */
  digest_email: string | null
  email: string | null
}

export interface WeeklySelection {
  likedChanges: WeeklyLikedChange[]
  likedOverflow: number
}

/**
 * The address to send to, or why we cannot.
 *
 * Returned rather than thrown because "this person has no address" is an
 * ordinary state of the user table, not a failure of the run.
 */
export type RecipientAddress
  = { _tag: 'ok', email: string }
    | { _tag: 'no_address' }

export function resolveRecipientAddress(user: WeeklyRecipient): RecipientAddress {
  const email = (user.digest_email ?? user.email ?? '').trim()
  return email ? { _tag: 'ok', email } : { _tag: 'no_address' }
}

/**
 * Everyone who should get the weekly.
 *
 * Opt-out rather than opt-in: the weekly is on for every account with a
 * deliverable address until that person turns it off. `weekly_opt_out` is the
 * only switch; `email_opt_in` governs the older watched-repo digest and the
 * two are deliberately independent, so turning one off does not silently
 * cancel the other.
 */
export async function loadWeeklyRecipients(db: D1Database): Promise<WeeklyRecipient[]> {
  const res = await db.prepare(
    `SELECT id, login, digest_email, email
     FROM users
     WHERE weekly_opt_out = 0
       AND COALESCE(NULLIF(TRIM(COALESCE(digest_email, '')), ''), NULLIF(TRIM(COALESCE(email, '')), '')) IS NOT NULL`,
  ).all<WeeklyRecipient>()
  return res.results ?? []
}

interface LikedChangeRow {
  owner: string
  repo: string
  name: string
  slug: string
  description: string | null
  change_count: number
  changed_at: number
}

/**
 * Changes in the window to skills this person liked.
 *
 * Scoped by like, not by subscription. A like is a statement about one skill,
 * and a repository holding twenty of them should not send twenty rows because
 * one was liked.
 *
 * Your own repositories are excluded. The 2026-08-19 send listed four skills
 * and every one of them was the recipient's, which reads as the product telling
 * you what you did last week. A digest is for changes you did not make, and
 * GitHub already emails you about your own pushes. Matched on login rather than
 * on any richer notion of ownership, because that is the only thing we know for
 * certain is the same person.
 */
export async function selectWeeklyForUser(
  db: D1Database,
  user: WeeklyRecipient,
  windowStart: number,
  windowEnd: number,
): Promise<WeeklySelection> {
  const res = await db.prepare(
    `SELECT a.owner, a.repo, a.name, s.slug, s.description,
            COUNT(*) AS change_count,
            MAX(a.occurred_at) AS changed_at
     FROM activity a
     JOIN skill_likes l
       ON l.user_id = ?1 AND l.owner = a.owner AND l.repo = a.repo AND l.name = a.name
     JOIN skills s
       ON s.owner = a.owner AND s.repo = a.repo AND s.name = a.name
     JOIN repos r ON r.owner = a.owner AND r.repo = a.repo
     WHERE a.occurred_at > ?2
       AND a.occurred_at <= ?3
       AND r.repo_kind != 'aggregator'
       AND LOWER(a.owner) != LOWER(?5)
     GROUP BY a.owner, a.repo, a.name
     ORDER BY changed_at DESC, change_count DESC
     LIMIT ?4`,
  ).bind(user.id, windowStart, windowEnd, LIKED_SCAN_LIMIT, user.login).all<LikedChangeRow>()

  const rows = res.results ?? []
  const listed = rows.slice(0, MAX_LIKED_CHANGES)
  const messages = await latestCommitMessages(db, listed, windowStart, windowEnd)

  return {
    likedChanges: listed.map((row, index) => ({
      owner: row.owner,
      repo: row.repo,
      name: row.name,
      slug: row.slug,
      description: row.description,
      changeCount: row.change_count,
      changedAt: row.changed_at,
      commitMessages: messages[index] ?? [],
    })),
    likedOverflow: rows.length - listed.length,
  }
}

/**
 * Commit subjects in the window, newest first, per listed skill.
 *
 * More than the three the email shows, because the template drops duplicates:
 * a week of "chore: bump" would otherwise fill the row with one sentence
 * repeated. Trimming to the subject line happens there too, so the text and
 * HTML halves cannot disagree about where a message ends.
 */
const COMMIT_SCAN_LIMIT = 10

async function latestCommitMessages(
  db: D1Database,
  rows: LikedChangeRow[],
  windowStart: number,
  windowEnd: number,
): Promise<string[][]> {
  if (!rows.length)
    return []
  const statements = rows.map(row => db.prepare(
    `SELECT message
     FROM skill_revisions
     WHERE owner = ?1 AND repo = ?2 AND name = ?3
       AND modified_at > ?4 AND modified_at <= ?5
       AND message IS NOT NULL AND TRIM(message) != ''
     ORDER BY modified_at DESC
     LIMIT ?6`,
  ).bind(row.owner, row.repo, row.name, windowStart, windowEnd, COMMIT_SCAN_LIMIT))
  const results = await db.batch<{ message: string }>(statements)
  return results.map(result => (result.results ?? []).map(row => row.message))
}

/**
 * The trending half, identical for every recipient.
 *
 * Reads the same loaders the `/skills/trending` board reads, so the email and
 * the page cannot disagree about what trended. When the socials were quiet the
 * board tops up from stars; the email does the same and labels those rows
 * `popular`, which says outright that nobody posted.
 */
export async function loadWeeklyTrending(
  db: D1Database,
  now: number,
): Promise<WeeklyTrendingSkill[]> {
  const deprioritizeRepositories = await loadTopStarredRepositories(db, 20)
  const named = await loadTrendingSkills({
    db,
    now,
    windowHours: DEFAULT_WINDOW_HOURS,
    limit: MAX_TRENDING,
    deprioritizeRepositories,
  })

  const trending: WeeklyTrendingSkill[] = named.map(entry => ({
    owner: entry.owner,
    repo: entry.repo,
    slug: entry.slug,
    canonicalName: entry.canonicalName,
    description: entry.description,
    stars: entry.stars,
    reason: reasonFor(entry),
    evidence: entry.evidence
      ? {
          url: entry.evidence.url,
          authorHandle: entry.evidence.authorHandle,
          text: entry.evidence.text,
          platform: entry.evidence.platform,
        }
      : null,
  }))

  if (trending.length >= MAX_TRENDING)
    return trending

  const fallback = await loadFallbackSkills({
    db,
    now,
    limit: MAX_TRENDING - trending.length,
    exclude: new Set(trending.map(skill => `${skill.owner}/${skill.repo}`)),
    deprioritizeRepositories,
  })

  return [
    ...trending,
    ...fallback.map(skill => ({
      owner: skill.owner,
      repo: skill.repo,
      slug: skill.slug,
      canonicalName: skill.canonicalName,
      description: skill.description,
      stars: skill.stars,
      reason: { _tag: 'popular' as const, stars: skill.stars },
      evidence: null,
    })),
  ]
}

function reasonFor(entry: {
  attribution: 'social' | 'github' | 'both'
  social: { authorCount: number, mentionCount: number, latestMentionAt: number } | null
  github: { latestGain: number, observedDay: number } | null
}): WeeklyReason {
  const authorCount = entry.social?.authorCount ?? 0
  const mentionCount = entry.social?.mentionCount ?? 0
  // Zero when the loader had no timestamp. The template reads that as "say
  // nothing about freshness" rather than dating the row to the epoch.
  const latestAt = entry.social?.latestMentionAt ?? 0
  const gain = entry.github?.latestGain ?? 0
  const day = entry.github?.observedDay ?? 0

  if (entry.attribution === 'both' && entry.social && entry.github)
    return { _tag: 'named-and-stars', authorCount, mentionCount, latestAt, gain, day }
  if (entry.attribution === 'github' && entry.github)
    return { _tag: 'stars', gain, day }
  return { _tag: 'named', authorCount, mentionCount, latestAt }
}
