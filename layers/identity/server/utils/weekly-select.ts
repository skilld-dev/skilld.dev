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
 * Everyone who should get the weekly.
 *
 * The weekly and digest are independent lists. A person can receive both.
 */
export async function loadWeeklyRecipients(db: D1Database): Promise<WeeklyRecipient[]> {
  const res = await db.prepare(
    `SELECT id, login, name, digest_email, email
     FROM users
     WHERE weekly_opt_out = 0
       AND COALESCE(NULLIF(TRIM(COALESCE(digest_email, '')), ''), NULLIF(TRIM(COALESCE(email, '')), '')) IS NOT NULL`,
  ).all<WeeklyRecipient>()
  return res.results ?? []
}

function sourceUrl(row: {
  owner: string
  repo: string
  name: string
  current_sha: string
  rendered_skill_path: string
}): string {
  return githubSkillSourceUrl({
    owner: row.owner,
    repo: row.repo,
    name: row.name,
    currentSha: row.current_sha,
    path: row.rendered_skill_path,
  })
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
    `SELECT current_sha, rendered_skill_path
     FROM skills
     WHERE owner = ?1 AND repo = ?2 AND name = ?3
       AND current_sha IS NOT NULL
       AND TRIM(current_sha) != ''
       AND rendered_skill_path IS NOT NULL
       AND TRIM(rendered_skill_path) != ''`,
  ).bind(skill.owner, skill.repo, skill.slug))
  const results = await db.batch<{ current_sha: string, rendered_skill_path: string }>(statements)
  return skills.flatMap((skill, index) => {
    const row = results[index]?.results?.[0]
    return row
      ? [{ ...skill, sourceUrl: sourceUrl({ ...skill, name: skill.slug, ...row }) }]
      : []
  })
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
