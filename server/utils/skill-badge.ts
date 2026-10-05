/// <reference types="@cloudflare/workers-types" />

import type { SkillBadgeTheme } from '../../shared/skill-badge'
import type { TrendingAward } from '../../shared/trending-award'
import { skillBadgeAwardTextWidth, skillBadgeAwardWidth } from '../../shared/skill-badge'
import { headlineTrendingAward, trendingAwardBadgeLabel, trendingAwardLabel } from '../../shared/trending-award'

const PLAIN_CACHE_POLICY = 'public, max-age=86400, stale-while-revalidate=604800'
const LIKES_CACHE_POLICY = 'public, max-age=300, stale-while-revalidate=3600'
// Awards change at most once an hour, when `record-trending-awards` runs.
const AWARD_CACHE_POLICY = 'public, max-age=3600, stale-while-revalidate=86400'
const AWARD_FILL = '#d7003f'

export type SkillBadgeTarget
  = | { _tag: 'repository', owner: string, repo: string }
    | { _tag: 'skill', owner: string, repo: string, name: string }

const BADGE_SEGMENT = /^[\w.-]{1,100}$/

export interface SkillBadgeAppearance {
  theme: SkillBadgeTheme
  showLabel: boolean
}

export interface SkillBadgeResponseInput {
  target: SkillBadgeTarget
  theme?: SkillBadgeTheme
  showLabel?: boolean
  likeCount?: number
  /** Undefined when not asked for. Null when asked for and none was earned. */
  award?: TrendingAward | null
}

export function parseSkillBadgeAppearance(query: { theme?: unknown, label?: unknown }): SkillBadgeAppearance {
  return {
    theme: query.theme === 'dark' ? 'dark' : 'light',
    showLabel: query.label !== '0',
  }
}

export function parseSkillBadgeTarget(slug: string): SkillBadgeTarget | null {
  const segments = slug.split('/')
  const [owner, repo, name] = segments as [string, string, string?]
  if ((segments.length !== 2 && segments.length !== 3) || !BADGE_SEGMENT.test(owner) || !BADGE_SEGMENT.test(repo))
    return null
  if (name !== undefined && (name.length === 0 || name.length > 100))
    return null

  return name
    ? { _tag: 'skill', owner, repo, name }
    : { _tag: 'repository', owner, repo }
}

export async function loadSkillBadgeLikeCount(db: D1Database, target: SkillBadgeTarget): Promise<number> {
  const statement = target._tag === 'skill'
    ? db.prepare(`SELECT COUNT(*) AS count
        FROM skill_likes
        WHERE owner = ?1 COLLATE NOCASE
          AND repo = ?2 COLLATE NOCASE
          AND name = ?3 COLLATE NOCASE`).bind(target.owner, target.repo, target.name)
    : db.prepare(`SELECT COUNT(*) AS count
        FROM skill_likes
        WHERE owner = ?1 COLLATE NOCASE
          AND repo = ?2 COLLATE NOCASE`).bind(target.owner, target.repo)
  const row = await statement.first<{ count: number }>()
  return row?.count ?? 0
}

/**
 * The best trending award for a badge target. A repository badge takes the
 * best award any of its Skills holds, as its like count sums their likes.
 */
export async function loadSkillBadgeAward(db: D1Database, target: SkillBadgeTarget): Promise<TrendingAward | null> {
  const statement = target._tag === 'skill'
    ? db.prepare(`SELECT board, period, best_rank AS rank
        FROM skill_trending_awards
        WHERE owner = ?1 COLLATE NOCASE
          AND repo = ?2 COLLATE NOCASE
          AND name = ?3 COLLATE NOCASE`).bind(target.owner, target.repo, target.name)
    : db.prepare(`SELECT board, period, best_rank AS rank
        FROM skill_trending_awards
        WHERE owner = ?1 COLLATE NOCASE
          AND repo = ?2 COLLATE NOCASE`).bind(target.owner, target.repo)
  const rows = (await statement.all<TrendingAward>()).results ?? []
  return headlineTrendingAward(rows)
}

function badgeLikeLabel(likeCount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(likeCount)
}

function skillBadgeSvg(input: SkillBadgeResponseInput): string {
  const { target, theme = 'light', likeCount, award } = input
  const showLabel = input.showLabel !== false
  const safeLikeCount = likeCount === undefined ? null : Math.max(0, Math.floor(likeCount))
  const showLikes = safeLikeCount !== null
  const likeLabel = showLikes ? badgeLikeLabel(safeLikeCount) : ''
  const likeWord = safeLikeCount === 1 ? 'like' : 'likes'
  const countWidth = showLikes ? Math.max(46, 25 + likeLabel.length * 7) : 0
  const badgeWidth = showLabel ? 153 : 81
  const awardLabel = award ? trendingAwardBadgeLabel(award) : ''
  const awardWidth = award ? skillBadgeAwardWidth(awardLabel) : 0
  const awardX = badgeWidth + countWidth
  const width = awardX + awardWidth
  const brandX = showLabel ? 72 : 0
  const categoryLabel = target._tag === 'repository' ? 'Skill repo' : 'Agent skill'
  const targetLabel = target._tag === 'repository' ? 'Skill repository' : 'Agent skill'
  const accessibleLabel = [
    `${targetLabel} on skilld.dev`,
    showLikes ? `${safeLikeCount} ${likeWord}` : null,
    award ? trendingAwardLabel(award) : null,
  ].filter(Boolean).join(', ')
  const darkTheme = theme === 'dark'
  const categoryFill = darkTheme ? '#3f3833' : '#f5f5f4'
  const categoryText = darkTheme ? '#ffffff' : '#292524'
  const brandFill = darkTheme ? '#f5f5f4' : '#2f2925'
  const brandText = darkTheme ? '#292524' : '#ffffff'
  const likesFill = darkTheme ? '#e7e5e4' : '#3f3833'
  const likesText = darkTheme ? '#292524' : '#ffffff'
  const categorySegment = showLabel
    ? `
    <rect width="72" height="22" fill="${categoryFill}"/>`
    : ''
  const categoryContent = showLabel
    ? `
  <text x="36" y="15" fill="${categoryText}" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10" text-anchor="middle">${categoryLabel}</text>`
    : ''
  const likesSegment = showLikes
    ? `
    <rect x="${badgeWidth}" width="${countWidth}" height="22" fill="${likesFill}"/>`
    : ''
  const awardSegment = award
    ? `
    <rect x="${awardX}" width="${awardWidth}" height="22" fill="${AWARD_FILL}"/>`
    : ''
  // Lucide "award", stroked white so it reads on the rose fill in both themes.
  const awardContent = award
    ? `
  <g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${awardX + 5} 4.4) scale(.55)">
    <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/>
    <circle cx="12" cy="8" r="6"/>
  </g>
  <text x="${awardX + 21}" y="15" fill="#ffffff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10" textLength="${skillBadgeAwardTextWidth(awardLabel)}" lengthAdjust="spacingAndGlyphs">${awardLabel}</text>`
    : ''
  const likesContent = showLikes
    ? `
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78a5.5 5.5 0 0 0 0-7.78Z" fill="none" stroke="#fb7185" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${badgeWidth + 4} 3.5) scale(.55)"/>
  <text x="${badgeWidth + 21}" y="15" fill="${likesText}" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10">${likeLabel}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="22" viewBox="0 0 ${width} 22" role="img" aria-label="${accessibleLabel}">
  <title>${accessibleLabel}</title>
  <clipPath id="r"><rect width="${width}" height="22" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    ${categorySegment}
    <rect x="${brandX}" width="81" height="22" fill="${brandFill}"/>${likesSegment}${awardSegment}
  </g>${categoryContent}
  <svg x="${brandX + 8.4}" y="6" width="12" height="12" viewBox="0 0 160 160" aria-hidden="true">
    <path d="M80 34 L135 104 L121 104 L80 52 L39 104 L25 104 Z" fill="#fb7185"/>
  </svg>
  <text x="${brandX + 23.3}" y="15" fill="${brandText}" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10" textLength="47.4" lengthAdjust="spacingAndGlyphs">skilld.dev</text>${likesContent}${awardContent}
</svg>`
}

export function createSkillBadgeResponse(input: SkillBadgeResponseInput): Response {
  const cachePolicy = input.likeCount !== undefined
    ? LIKES_CACHE_POLICY
    : input.award !== undefined ? AWARD_CACHE_POLICY : PLAIN_CACHE_POLICY
  return new Response(skillBadgeSvg(input), {
    status: 200,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': cachePolicy,
      'cloudflare-cdn-cache-control': cachePolicy,
      'content-type': 'image/svg+xml; charset=utf-8',
      'cross-origin-resource-policy': 'cross-origin',
      'x-content-type-options': 'nosniff',
    },
  })
}
