import { requireAdmin } from '../../../utils/admin'
import { findSkill } from '../../../utils/skills-registry'
import { fetchSocialPost } from '../../../utils/social-ingest'

interface Body {
  url: string
  skillSlug: string
  role?: 'author' | 'community'
  autoApprove?: boolean
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<Body>(event)

  if (!body?.url || !body?.skillSlug)
    throw createError({ statusCode: 400, message: 'Missing url or skillSlug' })

  const skill = await findSkill(event, body.skillSlug)
  if (!skill)
    throw createError({ statusCode: 404, message: `Unknown skill: ${body.skillSlug}` })

  const fetched = await fetchSocialPost(body.url)

  // Author role only inferable for X/Bsky where handle ~ github owner.
  // Reddit handles rarely match, so default to community unless overridden.
  const inferredRole: 'author' | 'community'
    = fetched.platform !== 'reddit' && fetched.authorHandle.toLowerCase() === skill.owner.toLowerCase()
      ? 'author'
      : 'community'
  const role = body.role ?? inferredRole
  const status = body.autoApprove !== false ? 'approved' : 'pending'
  const now = Math.floor(Date.now() / 1000)

  const db = getDB(event)
  await db
    .prepare(`
      INSERT INTO skill_social_posts (
        skill_slug, platform, post_url, post_id,
        author_handle, author_display_name, author_avatar,
        role, status, text_extract, title, oembed_html,
        bsky_uri, bsky_cid, subreddit, reddit_kind, score,
        posted_at, fetched_at, approved_by, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(skill_slug, platform, post_id) DO UPDATE SET
        author_display_name = excluded.author_display_name,
        author_avatar = excluded.author_avatar,
        text_extract = excluded.text_extract,
        title = excluded.title,
        oembed_html = excluded.oembed_html,
        bsky_uri = excluded.bsky_uri,
        bsky_cid = excluded.bsky_cid,
        subreddit = excluded.subreddit,
        reddit_kind = excluded.reddit_kind,
        score = excluded.score,
        posted_at = excluded.posted_at,
        fetched_at = excluded.fetched_at
    `)
    .bind(
      body.skillSlug,
      fetched.platform,
      fetched.postUrl,
      fetched.postId,
      fetched.authorHandle,
      fetched.authorDisplayName,
      fetched.authorAvatar,
      role,
      status,
      fetched.textExtract,
      fetched.title,
      fetched.oembedHtml,
      fetched.bskyUri,
      fetched.bskyCid,
      fetched.subreddit,
      fetched.redditKind,
      fetched.score,
      fetched.postedAt,
      now,
      status === 'approved' ? admin.handle : null,
      status === 'approved' ? now : null,
    )
    .run()

  return { ok: true, role, status, fetched }
})
