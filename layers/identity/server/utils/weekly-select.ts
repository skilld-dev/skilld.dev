/// <reference types="@cloudflare/workers-types" />

/**
 * The audience and distinct trending Skills for one weekly email.
 */

import type { WeeklyReason, WeeklyTrendingSkill } from './weekly-template'
import { loadFallbackSkills } from '#shared/server/trending-fallback'
import { loadTopStarredRepositories } from '#shared/server/trending-repos'
import { DEFAULT_WINDOW_HOURS, loadTrendingSkills } from '#shared/server/trending-skills'
import { githubSkillSourceUrl } from './email-skill-links'
import {
  excludeRecentlySentWeeklySkills,
  loadRecentWeeklySkillKeys,
} from './weekly-history'
import { MAX_WEEKLY_TRENDING } from './weekly-template'

/**
 * Trending rows carried into the email.
 *
 * Fewer than the board shows on purpose: an email is read in one pass and a
 * thirty-row leaderboard in an inbox is a page, not a message. Seven is the
 * most that still scans in one pass, and it matters more now that the liked
 * section no longer pads the email with the reader's own repositories.
 */
export const MAX_TRENDING = MAX_WEEKLY_TRENDING

export interface WeeklyRecipient {
  id: number
  login: string
  name?: string | null
  /** Verified digest address, preferred over the GitHub profile address. */
  digest_email: string | null
  email: string | null
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
 * Everything the weekly gate reads off a user row.
 */
export interface WeeklyConsent {
  weekly_opt_out: number
  email_opt_in: number
  digest_email: string | null
  email: string | null
}

/**
 * Whether the weekly actually reaches this person.
 *
 * Single source of truth for the delivery list and the dashboard badge. The
 * weekly and digest are independent lists and a person can receive both, so
 * three things must hold: `weekly_opt_out` is off (the unsubscribe switch),
 * an explicit consent signal exists (`email_opt_in` or a deliberately stored
 * `digest_email`), and one of them holds a deliverable address. A captured
 * GitHub profile address is none of those on its own.
 */
export function weeklyDeliveryActive(user: WeeklyConsent): boolean {
  const digest = (user.digest_email ?? '').trim()
  const address = digest !== '' ? digest : (user.email ?? '').trim()
  return user.weekly_opt_out === 0
    && (user.email_opt_in === 1 || user.digest_email !== null)
    && address !== ''
}

/**
 * Everyone who should get the weekly, decided by `weeklyDeliveryActive`.
 *
 * Filtering here rather than in SQL keeps the list and the `/me` badge on one
 * predicate, so the dashboard cannot promise a delivery the run would skip.
 */
export async function loadWeeklyRecipients(db: D1Database): Promise<WeeklyRecipient[]> {
  const res = await db.prepare(
    `SELECT id, login, name, digest_email, email, email_opt_in, weekly_opt_out
     FROM users
     WHERE weekly_opt_out = 0`,
  ).all<WeeklyRecipient & WeeklyConsent>()
  return (res.results ?? []).filter(weeklyDeliveryActive)
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
  const [deprioritizeRepositories, recentKeys] = await Promise.all([
    loadTopStarredRepositories(db, 20),
    loadRecentWeeklySkillKeys(db, now),
  ])
  const candidateLimit = MAX_TRENDING + recentKeys.size
  const namedCandidates = await loadTrendingSkills({
    db,
    now,
    windowHours: DEFAULT_WINDOW_HOURS,
    limit: candidateLimit,
    deprioritizeRepositories,
  })

  const named: WeeklyTrendingSkill[] = namedCandidates.map(entry => ({
    owner: entry.owner,
    repo: entry.repo,
    slug: entry.slug,
    canonicalName: entry.canonicalName,
    description: entry.description,
    stars: entry.stars,
    repoSkillCount: entry.repoSkillCount,
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

  const trending = excludeRecentlySentWeeklySkills(named, recentKeys, MAX_TRENDING)
  if (trending.length >= MAX_TRENDING)
    return await hydrateSourceUrls(db, trending)

  const fallback = await loadFallbackSkills({
    db,
    now,
    limit: candidateLimit,
    exclude: new Set(trending.map(skill => `${skill.owner}/${skill.repo}`)),
    deprioritizeRepositories,
  })

  const selected = excludeRecentlySentWeeklySkills([
    ...trending,
    ...fallback.map(skill => ({
      owner: skill.owner,
      repo: skill.repo,
      slug: skill.slug,
      canonicalName: skill.canonicalName,
      description: skill.description,
      stars: skill.stars,
      repoSkillCount: skill.repoSkillCount,
      reason: { _tag: 'popular' as const, stars: skill.stars },
      evidence: null,
    })),
  ], recentKeys, MAX_TRENDING)

  return await hydrateSourceUrls(db, selected)
}

async function hydrateSourceUrls(
  db: D1Database,
  skills: WeeklyTrendingSkill[],
): Promise<WeeklyTrendingSkill[]> {
  if (!skills.length)
    return []
  const statements = skills.map(skill => db.prepare(
    `SELECT s.rendered_skill_path, r.default_branch
     FROM skills s
     LEFT JOIN repos r ON r.owner = s.owner AND r.repo = s.repo
     WHERE s.owner = ?1 AND s.repo = ?2 AND s.name = ?3
       AND s.current_sha IS NOT NULL
       AND TRIM(s.current_sha) != ''
       AND s.rendered_skill_path IS NOT NULL
       AND TRIM(s.rendered_skill_path) != ''`,
  ).bind(skill.owner, skill.repo, skill.slug))
  const results = await db.batch<{
    rendered_skill_path: string
    default_branch: string | null
  }>(statements)
  return skills.flatMap((skill, index) => {
    const row = results[index]?.results?.[0]
    return row
      ? [{
          ...skill,
          sourceUrl: githubSkillSourceUrl({
            owner: skill.owner,
            repo: skill.repo,
            path: row.rendered_skill_path,
            branch: row.default_branch,
          }),
        }]
      : []
  })
}

function reasonFor(entry: {
  attribution: 'social' | 'github' | 'both'
  social: { authorCount: number, mentionCount: number, latestMentionAt: number } | null
  github: { latestGain: number, observedDay: number } | null
  mentionsByDay: number[] | null
}): WeeklyReason {
  const authorCount = entry.social?.authorCount ?? 0
  const mentionCount = entry.social?.mentionCount ?? 0
  // Zero when the loader had no timestamp. The template reads that as "say
  // nothing about freshness" rather than dating the row to the epoch.
  const latestAt = entry.social?.latestMentionAt ?? 0
  const gain = entry.github?.latestGain ?? 0
  const day = entry.github?.observedDay ?? 0
  const mentionsByDay = entry.mentionsByDay

  if (entry.attribution === 'both' && entry.social && entry.github)
    return { _tag: 'named-and-stars', authorCount, mentionCount, latestAt, mentionsByDay, gain, day }
  if (entry.attribution === 'github' && entry.github)
    return { _tag: 'stars', gain, day }
  return { _tag: 'named', authorCount, mentionCount, latestAt, mentionsByDay }
}
