import type { RegistrySkill } from '../utils/skills-registry'

export type SkillWithOfficial = RegistrySkill & { official: boolean }

export function makeSkillPresenter(officialOwners: Set<string>) {
  return (s: RegistrySkill): SkillWithOfficial => ({
    ...s,
    official: officialOwners.has(s.owner),
  })
}

export interface OwnerFacet {
  name: string
  count: number
  official: boolean
}

export function makeOwnerFacetPresenter(officialOwners: Set<string>) {
  return (f: { owner: string, count: number }): OwnerFacet => ({
    name: f.owner,
    count: f.count,
    official: officialOwners.has(f.owner),
  })
}

export interface SkillSocialPostRow {
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

export function socialPostPresenter(r: SkillSocialPostRow): SkillSocialPost {
  return {
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
  }
}
