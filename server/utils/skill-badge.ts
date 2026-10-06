/// <reference types="@cloudflare/workers-types" />

import type { SkillBadgeTheme } from '../../shared/skill-badge'
import type { TrendingAward } from '../../shared/trending-award'
import { BRAND_DARK, BRAND_LIGHT, markGeometry } from '../../shared/brand-mark'
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

/** `flat` matches shields.io's default badge, so a skilld badge can sit in a row of them. */
export type SkillBadgeStyle = 'skilld' | 'flat'

/** Colour overrides, named after the shields.io parameters. Each is a `#rrggbb` hex. */
export interface SkillBadgeColors {
  /** The category segment. */
  label?: string
  /** The skilld segment. */
  brand?: string
  /** The caret and the dot together, for a one-colour mark. */
  logo?: string
}

export interface SkillBadgeAppearance {
  theme: SkillBadgeTheme
  showLabel: boolean
  style: SkillBadgeStyle
  colors: SkillBadgeColors
}

export interface SkillBadgeResponseInput {
  target: SkillBadgeTarget
  theme?: SkillBadgeTheme
  showLabel?: boolean
  style?: SkillBadgeStyle
  colors?: SkillBadgeColors
  likeCount?: number
  /** Undefined when not asked for. Null when asked for and none was earned. */
  award?: TrendingAward | null
}

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** A shields-style colour value (`16152b`, `#16152b` or `fff`) as `#rrggbb`. Anything else is ignored. */
function parseHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const match = HEX_COLOR.exec(value.trim())
  if (!match)
    return undefined
  const hex = match[1]!.toLowerCase()
  return `#${hex.length === 3 ? [...hex].map(char => char + char).join('') : hex}`
}

export function parseSkillBadgeAppearance(query: { theme?: unknown, label?: unknown, style?: unknown, labelColor?: unknown, color?: unknown, logoColor?: unknown }): SkillBadgeAppearance {
  const colors: SkillBadgeColors = {}
  const label = parseHexColor(query.labelColor)
  const brand = parseHexColor(query.color)
  const logo = parseHexColor(query.logoColor)
  if (label)
    colors.label = label
  if (brand)
    colors.brand = brand
  if (logo)
    colors.logo = logo
  return {
    theme: query.theme === 'dark' ? 'dark' : 'light',
    showLabel: query.label !== '0',
    style: query.style === 'flat' ? 'flat' : 'skilld',
    colors,
  }
}

/** Relative luminance of a `#rrggbb` colour, 0 for black to 1 for white. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

const isDarkFill = (hex: string) => luminance(hex) < 0.4

/** Text colour for a fill: white on dark fills, stone 800 on light ones. */
const textOn = (fill: string) => isDarkFill(fill) ? '#ffffff' : '#292524'

/**
 * The skilld mark: the caret in the text colour and one rose dot, in the shade
 * DESIGN.md pairs with the surface. A logo colour paints both in one colour.
 */
function badgeMark(input: { x: number, y: number, size: number, fill: string, logo?: string }): string {
  const { viewBox, caret, dot } = markGeometry(input.size <= 16 ? 'small' : 'regular')
  const caretFill = input.logo ?? textOn(input.fill)
  const dotFill = input.logo ?? (isDarkFill(input.fill) ? BRAND_DARK.dot : BRAND_LIGHT.dot)
  return `<svg x="${input.x}" y="${input.y}" width="${input.size}" height="${input.size}" viewBox="${viewBox}" aria-hidden="true"><path d="${caret}" fill="${caretFill}"/><circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${dotFill}"/></svg>`
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

/**
 * The trending mark (`⣀⣤⣶⣿`, see `TrendingMark.vue`) drawn as dots. A badge
 * renders in GitHub's image proxy, where no font is sure to carry braille.
 */
function trendingMarkDots(x: number, baseline = 15.4): string {
  const dots: string[] = []
  for (const [cell, level] of [1, 2, 3, 4].entries()) {
    for (let row = 0; row < level; row++) {
      for (const column of [0, 2.2])
        dots.push(`<circle cx="${Math.round((x + cell * 5.6 + column) * 10) / 10}" cy="${Math.round((baseline - row * 2.2) * 10) / 10}" r="0.85"/>`)
    }
  }
  return dots.join('')
}

function badgeLikeLabel(likeCount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(likeCount)
}

function skillBadgeSvg(input: SkillBadgeResponseInput): string {
  const { target, theme = 'light', likeCount, award, colors = {} } = input
  const showLabel = input.showLabel !== false
  const safeLikeCount = likeCount === undefined ? null : Math.max(0, Math.floor(likeCount))
  const showLikes = safeLikeCount !== null
  const likeLabel = showLikes ? badgeLikeLabel(safeLikeCount) : ''
  const countWidth = showLikes ? Math.max(46, 25 + likeLabel.length * 7) : 0
  const badgeWidth = showLabel ? 153 : 81
  const awardLabel = award ? trendingAwardBadgeLabel(award) : ''
  const awardWidth = award ? skillBadgeAwardWidth(awardLabel) : 0
  const awardX = badgeWidth + countWidth
  const width = awardX + awardWidth
  const brandX = showLabel ? 72 : 0
  const categoryLabel = target._tag === 'repository' ? 'Skill repo' : 'Agent skill'
  const accessibleLabel = badgeAccessibleLabel(input)
  const darkTheme = theme === 'dark'
  const categoryFill = colors.label ?? (darkTheme ? '#3f3833' : '#f5f5f4')
  const categoryText = textOn(categoryFill)
  const brandFill = colors.brand ?? (darkTheme ? '#f5f5f4' : '#2f2925')
  const brandText = textOn(brandFill)
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
  // White on the rose fill, so the newest bar spends no second rose.
  const awardContent = award
    ? `
  <g fill="#ffffff" aria-hidden="true">${trendingMarkDots(awardX + 7)}</g>
  <text x="${awardX + 30}" y="15" fill="#ffffff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10" textLength="${skillBadgeAwardTextWidth(awardLabel)}" lengthAdjust="spacingAndGlyphs">${awardLabel}</text>`
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
  ${badgeMark({ x: brandX + 7.4, y: 5, size: 12, fill: brandFill, logo: colors.logo })}
  <text x="${brandX + 23.3}" y="15" fill="${brandText}" font-family="Verdana,DejaVu Sans,sans-serif" font-size="10" textLength="47.4" lengthAdjust="spacingAndGlyphs">skilld.dev</text>${likesContent}${awardContent}
</svg>`
}

const FLAT_FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif'
/** shields.io's default label grey, for a flat badge with no label colour. */
const FLAT_LABEL_FILL = '#555555'

/**
 * Verdana advance widths at 11px, the size shields.io sets badge text in. The
 * SVG pins each text run to this width, so the layout never depends on the
 * reader's installed fonts.
 */
function verdanaWidth(text: string): number {
  let width = 0
  for (const char of text) {
    if ('ijl'.includes(char))
      width += 3
    else if (' .,:;·\''.includes(char))
      width += 3.9
    else if ('ftr'.includes(char))
      width += 4.5
    else if (char === 'm')
      width += 10.5
    else if (char === 'w')
      width += 9
    else if ('csz'.includes(char))
      width += 5.8
    else if (/[0-9#]/.test(char))
      width += 7
    else if (/[A-Z]/.test(char))
      width += 7.5
    else
      width += 6.7
  }
  return Math.round(width * 10) / 10
}

interface FlatSegment {
  fill: string
  width: number
  draw: (x: number) => string
}

/** A text run in shields.io's flat style: 11px Verdana with a one pixel drop shadow. */
function flatText(text: string, x: number, fill: string): string {
  const width = verdanaWidth(text)
  const centre = Math.round((x + width / 2) * 10)
  const shadow = isDarkFill(fill) ? '#010101' : '#cccccc'
  const color = textOn(fill)
  return `<text aria-hidden="true" x="${centre}" y="150" fill="${shadow}" fill-opacity=".3" transform="scale(.1)" textLength="${Math.round(width * 10)}">${text}</text>`
    + `<text x="${centre}" y="140" transform="scale(.1)" fill="${color}" textLength="${Math.round(width * 10)}">${text}</text>`
}

/** The badge in shields.io's default flat style, so it lines up in a row of shields badges. */
function flatBadgeSvg(input: SkillBadgeResponseInput): string {
  const { target, theme = 'light', likeCount, award, colors = {} } = input
  const showLabel = input.showLabel !== false
  const safeLikeCount = likeCount === undefined ? null : Math.max(0, Math.floor(likeCount))
  const labelFill = colors.label ?? FLAT_LABEL_FILL
  const brandFill = colors.brand ?? (theme === 'dark' ? BRAND_DARK.ink : BRAND_LIGHT.ink)
  const segments: FlatSegment[] = []
  if (showLabel) {
    const text = target._tag === 'repository' ? 'Skill repo' : 'Agent skill'
    segments.push({ fill: labelFill, width: verdanaWidth(text) + 10, draw: x => flatText(text, x + 5, labelFill) })
  }
  segments.push({
    fill: brandFill,
    width: verdanaWidth('skilld.dev') + 27,
    draw: x => badgeMark({ x: x + 5, y: 3, size: 14, fill: brandFill, logo: colors.logo }) + flatText('skilld.dev', x + 22, brandFill),
  })
  if (safeLikeCount !== null) {
    const text = badgeLikeLabel(safeLikeCount)
    const fill = labelFill
    segments.push({
      fill,
      width: verdanaWidth(text) + 27,
      draw: x => `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78a5.5 5.5 0 0 0 0-7.78Z" fill="none" stroke="${BRAND_DARK.dot}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x + 5} 3) scale(.58)"/>${
        flatText(text, x + 22, fill)}`,
    })
  }
  if (award) {
    const text = trendingAwardBadgeLabel(award)
    segments.push({
      fill: AWARD_FILL,
      width: verdanaWidth(text) + 37,
      draw: x => `<g fill="#ffffff" aria-hidden="true">${trendingMarkDots(x + 5, 14.4)}</g>${flatText(text, x + 32, AWARD_FILL)}`,
    })
  }

  let x = 0
  const placed = segments.map((segment) => {
    const at = x
    x += segment.width
    return { ...segment, at }
  })
  const width = Math.ceil(x)
  const label = badgeAccessibleLabel(input)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${label}">
  <title>${label}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">${placed.map(segment => `<rect x="${segment.at}" width="${Math.ceil(segment.width)}" height="20" fill="${segment.fill}"/>`).join('')}<rect width="${width}" height="20" fill="url(#s)"/></g>
  <g text-anchor="middle" font-family="${FLAT_FONT}" text-rendering="geometricPrecision" font-size="110">${placed.map(segment => segment.draw(segment.at)).join('')}</g>
</svg>`
}

function badgeAccessibleLabel(input: SkillBadgeResponseInput): string {
  const { target, likeCount, award } = input
  const safeLikeCount = likeCount === undefined ? null : Math.max(0, Math.floor(likeCount))
  return [
    `${target._tag === 'repository' ? 'Skill repository' : 'Agent skill'} on skilld.dev`,
    safeLikeCount === null ? null : `${safeLikeCount} ${safeLikeCount === 1 ? 'like' : 'likes'}`,
    award ? trendingAwardLabel(award) : null,
  ].filter(Boolean).join(', ')
}

export function createSkillBadgeResponse(input: SkillBadgeResponseInput): Response {
  const cachePolicy = input.likeCount !== undefined
    ? LIKES_CACHE_POLICY
    : input.award !== undefined ? AWARD_CACHE_POLICY : PLAIN_CACHE_POLICY
  return new Response(input.style === 'flat' ? flatBadgeSvg(input) : skillBadgeSvg(input), {
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
