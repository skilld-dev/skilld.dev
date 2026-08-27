/// <reference types="@cloudflare/workers-types" />

const PLAIN_CACHE_POLICY = 'public, max-age=86400, stale-while-revalidate=604800'
const LIKES_CACHE_POLICY = 'public, max-age=300, stale-while-revalidate=3600'

export type SkillBadgeTarget
  = | { _tag: 'repository', owner: string, repo: string }
    | { _tag: 'skill', owner: string, repo: string, name: string }

const BADGE_SEGMENT = /^[\w.-]{1,100}$/

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

function badgeLikeLabel(likeCount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(likeCount)
}

function skillBadgeSvg(likeCount?: number): string {
  const safeLikeCount = likeCount === undefined ? null : Math.max(0, Math.floor(likeCount))
  const showLikes = safeLikeCount !== null && safeLikeCount > 0
  const likeLabel = showLikes ? badgeLikeLabel(safeLikeCount) : ''
  const likeWord = safeLikeCount === 1 ? 'like' : 'likes'
  const countWidth = showLikes ? Math.max(37, 25 + likeLabel.length * 7) : 0
  const width = 137 + countWidth
  const accessibleLabel = showLikes
    ? `Run on skilld.dev, ${safeLikeCount} ${likeWord}`
    : 'Run on skilld.dev'
  const likesSegment = showLikes
    ? `
    <rect x="137" width="${countWidth}" height="20" fill="#2f2925"/>`
    : ''
  const likesContent = showLikes
    ? `
  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.08 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5 22 12.27 18.6 15.36 13.45 20.03Z" fill="#fb7185" transform="translate(139 2.5) scale(.58)"/>
  <text x="156" y="14" fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">${likeLabel}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${accessibleLabel}">
  <title>${accessibleLabel}</title>
  <clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="61" height="20" fill="#2f2925"/>
    <rect x="61" width="76" height="20" fill="#fb7185"/>${likesSegment}
  </g>
  <g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="30.5" y="14" text-anchor="middle">Run on</text>
  </g>
  <path d="M80 34 L135 104 L121 104 L80 52 L39 104 L25 104 Z" fill="#171311" transform="translate(62 2.5) scale(.085)"/>
  <text x="78" y="14" fill="#171311" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">skilld.dev</text>${likesContent}
</svg>`
}

export function createSkillBadgeResponse(likeCount?: number): Response {
  const cachePolicy = likeCount === undefined ? PLAIN_CACHE_POLICY : LIKES_CACHE_POLICY
  return new Response(skillBadgeSvg(likeCount), {
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
