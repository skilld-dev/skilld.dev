/// <reference types="@cloudflare/workers-types" />

const CACHE_POLICY = 'public, max-age=300, stale-while-revalidate=3600'

export type SkillBadgeTarget
  = | { _tag: 'repository', owner: string, repo: string }
    | { _tag: 'skill', owner: string, repo: string, name: string }

const BADGE_SEGMENT = /^[\w.-]{1,100}$/

export function parseSkillBadgeTarget(slug: string): SkillBadgeTarget | null {
  const segments = slug.split('/')
  if ((segments.length !== 2 && segments.length !== 3) || !segments.every(segment => BADGE_SEGMENT.test(segment)))
    return null

  const [owner, repo, name] = segments as [string, string, string?]
  return name
    ? { _tag: 'skill', owner, repo, name }
    : { _tag: 'repository', owner, repo }
}

export async function loadSkillBadgeLikeCount(db: D1Database, target: SkillBadgeTarget): Promise<number> {
  const statement = target._tag === 'skill'
    ? db.prepare(`SELECT COUNT(*) AS count
        FROM skill_likes
        WHERE owner = ?1 AND repo = ?2 AND name = ?3`).bind(target.owner, target.repo, target.name)
    : db.prepare(`SELECT COUNT(*) AS count
        FROM skill_likes
        WHERE owner = ?1 AND repo = ?2`).bind(target.owner, target.repo)
  const row = await statement.first<{ count: number }>()
  return row?.count ?? 0
}

function badgeLikeLabel(likeCount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(likeCount)
}

function skillBadgeSvg(likeCount: number): string {
  const safeLikeCount = Math.max(0, Math.floor(likeCount))
  const likeLabel = badgeLikeLabel(safeLikeCount)
  const likeWord = safeLikeCount === 1 ? 'like' : 'likes'
  const countWidth = Math.max(37, 25 + likeLabel.length * 7)
  const width = 113 + countWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="Run on skilld, ${safeLikeCount} ${likeWord}">
  <title>Run on skilld, ${safeLikeCount} ${likeWord}</title>
  <clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="61" height="20" fill="#2f2925"/>
    <rect x="61" width="52" height="20" fill="#fb7185"/>
    <rect x="113" width="${countWidth}" height="20" fill="#2f2925"/>
  </g>
  <g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="30.5" y="14" text-anchor="middle">Run on</text>
  </g>
  <path d="M80 34 L135 104 L121 104 L80 52 L39 104 L25 104 Z" fill="#171311" transform="translate(62 2.5) scale(.085)"/>
  <text x="78" y="14" fill="#171311" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">skilld</text>
  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.08 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5 22 12.27 18.6 15.36 13.45 20.03Z" fill="#fb7185" transform="translate(115 2.5) scale(.58)"/>
  <text x="132" y="14" fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">${likeLabel}</text>
</svg>`
}

export function createSkillBadgeResponse(likeCount: number): Response {
  return new Response(skillBadgeSvg(likeCount), {
    status: 200,
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': CACHE_POLICY,
      'cloudflare-cdn-cache-control': CACHE_POLICY,
      'content-type': 'image/svg+xml; charset=utf-8',
      'cross-origin-resource-policy': 'cross-origin',
      'x-content-type-options': 'nosniff',
    },
  })
}
