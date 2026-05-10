import type { SkillSocialPostRow } from '../../presenters/skill'
import { defineApiHandler } from '#shared/server/handler'
import { socialPostPresenter } from '../../presenters/skill'

export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slugParam = getRouterParam(event, 'slug')
    if (!slugParam)
      throw createError({ statusCode: 400, message: 'Missing slug' })
    const slug = decodeURIComponent(slugParam)

    const { results } = await platform.db.prepare(`
      SELECT id, platform, post_url, post_id, author_handle,
             author_display_name, author_avatar, role,
             text_extract, title, oembed_html, bsky_uri, bsky_cid,
             subreddit, reddit_kind, score, posted_at
      FROM skill_social_posts
      WHERE skill_slug = ? AND status = 'approved'
      ORDER BY role ASC, posted_at DESC, id DESC
    `).bind(slug).all<SkillSocialPostRow>()

    const posts = (results ?? []).map(socialPostPresenter)
    return {
      author: posts.filter(p => p.role === 'author'),
      community: posts.filter(p => p.role === 'community'),
    }
  },
})
