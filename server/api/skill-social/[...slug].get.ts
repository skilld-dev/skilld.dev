interface Row {
  id: number
  platform: 'twitter' | 'bsky' | 'reddit'
  post_url: string
  post_id: string
  author_handle: string
  author_display_name: string | null
  author_avatar: string | null
  role: 'author' | 'community'
  text_extract: string
  title: string | null
  oembed_html: string | null
  bsky_uri: string | null
  bsky_cid: string | null
  subreddit: string | null
  reddit_kind: 'post' | 'comment' | null
  score: number | null
  posted_at: number | null
}

export interface SkillSocialPost {
  id: number
  platform: 'twitter' | 'bsky' | 'reddit'
  postUrl: string
  postId: string
  authorHandle: string
  authorDisplayName: string | null
  authorAvatar: string | null
  role: 'author' | 'community'
  textExtract: string
  title: string | null
  oembedHtml: string | null
  bskyUri: string | null
  bskyCid: string | null
  subreddit: string | null
  redditKind: 'post' | 'comment' | null
  score: number | null
  postedAt: number | null
}

export default defineEventHandler(async (event) => {
  const slugParam = getRouterParam(event, 'slug')
  if (!slugParam)
    throw createError({ statusCode: 400, message: 'Missing slug' })
  const slug = decodeURIComponent(slugParam)

  const { results } = await getDB(event)
    .prepare(`
      SELECT id, platform, post_url, post_id, author_handle,
             author_display_name, author_avatar, role,
             text_extract, title, oembed_html, bsky_uri, bsky_cid,
             subreddit, reddit_kind, score, posted_at
      FROM skill_social_posts
      WHERE skill_slug = ? AND status = 'approved'
      ORDER BY role ASC, posted_at DESC, id DESC
    `)
    .bind(slug)
    .all<Row>()

  const posts: SkillSocialPost[] = (results ?? []).map(r => ({
    id: r.id,
    platform: r.platform,
    postUrl: r.post_url,
    postId: r.post_id,
    authorHandle: r.author_handle,
    authorDisplayName: r.author_display_name,
    authorAvatar: r.author_avatar,
    role: r.role,
    textExtract: r.text_extract,
    title: r.title,
    oembedHtml: r.oembed_html,
    bskyUri: r.bsky_uri,
    bskyCid: r.bsky_cid,
    subreddit: r.subreddit,
    redditKind: r.reddit_kind,
    score: r.score,
    postedAt: r.posted_at,
  }))

  return {
    author: posts.filter(p => p.role === 'author'),
    community: posts.filter(p => p.role === 'community'),
  }
})
