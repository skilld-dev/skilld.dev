import { getPublicAgent } from './atproto/agent'

export interface SocialPostFetched {
  platform: 'twitter' | 'bsky' | 'reddit'
  postId: string
  postUrl: string
  authorHandle: string
  authorDisplayName: string | null
  authorAvatar: string | null
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

const TWITTER_RE = /^https?:\/\/(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i
const BSKY_RE = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i
const REDDIT_POST_RE = /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/[^/]*)?\/?$/i
const REDDIT_COMMENT_RE = /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)\/[^/]+\/([a-z0-9]+)\/?/i

export type Platform = 'twitter' | 'bsky' | 'reddit'

export function detectPlatform(url: string): Platform | null {
  if (TWITTER_RE.test(url))
    return 'twitter'
  if (BSKY_RE.test(url))
    return 'bsky'
  if (REDDIT_COMMENT_RE.test(url) || REDDIT_POST_RE.test(url))
    return 'reddit'
  return null
}

interface XOembedResponse {
  html: string
  author_name?: string
  author_url?: string
}

async function fetchTwitter(url: string): Promise<SocialPostFetched> {
  const m = url.match(TWITTER_RE)
  if (!m)
    throw createError({ statusCode: 400, message: 'Invalid X/Twitter URL' })
  const [, handle, postId] = m as [string, string, string]
  const oembedUrl = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`
  const res = await $fetch<XOembedResponse>(oembedUrl)
  const text = stripHtml(res.html).replace(/^"|"$/g, '').trim()
  return {
    platform: 'twitter',
    postId,
    postUrl: url,
    authorHandle: handle,
    authorDisplayName: res.author_name ?? null,
    authorAvatar: null,
    textExtract: text,
    title: null,
    oembedHtml: res.html,
    bskyUri: null,
    bskyCid: null,
    subreddit: null,
    redditKind: null,
    score: null,
    postedAt: null,
  }
}

async function fetchBluesky(url: string): Promise<SocialPostFetched> {
  const m = url.match(BSKY_RE)
  if (!m)
    throw createError({ statusCode: 400, message: 'Invalid Bluesky URL' })
  const [, handle, rkey] = m as [string, string, string]
  const agent = getPublicAgent()
  const profile = await agent.getProfile({ actor: handle })
  const did = profile.data.did
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const posts = await agent.getPosts({ uris: [uri] })
  const post = posts.data.posts[0]
  if (!post)
    throw createError({ statusCode: 404, message: 'Bluesky post not found' })
  const record = post.record as { text?: string, createdAt?: string }
  return {
    platform: 'bsky',
    postId: rkey,
    postUrl: url,
    authorHandle: profile.data.handle,
    authorDisplayName: profile.data.displayName ?? null,
    authorAvatar: profile.data.avatar ?? null,
    textExtract: (record.text ?? '').trim(),
    title: null,
    oembedHtml: null,
    bskyUri: uri,
    bskyCid: post.cid,
    subreddit: null,
    redditKind: null,
    score: null,
    postedAt: record.createdAt ? Math.floor(new Date(record.createdAt).getTime() / 1000) : null,
  }
}

interface RedditChild<T> {
  kind: string
  data: T
}
interface RedditListing<T> {
  data: { children: RedditChild<T>[] }
}
interface RedditPostData {
  id: string
  subreddit: string
  author: string
  title: string
  selftext: string
  permalink: string
  score: number
  created_utc: number
}
interface RedditCommentData {
  id: string
  subreddit: string
  author: string
  body: string
  permalink: string
  score: number
  created_utc: number
  link_title?: string
}

async function fetchReddit(url: string): Promise<SocialPostFetched> {
  const commentMatch = url.match(REDDIT_COMMENT_RE)
  const postMatch = url.match(REDDIT_POST_RE)
  if (!commentMatch && !postMatch)
    throw createError({ statusCode: 400, message: 'Invalid Reddit URL' })

  // Strip query/fragment, normalize to www.reddit.com, request JSON.
  const normalized = url.replace(/[?#].*$/, '').replace(/\/+$/, '')
  const jsonUrl = `${normalized.replace(/^https?:\/\/(?:old|new|www)?\.?reddit\.com/, 'https://www.reddit.com')}.json?raw_json=1`
  const headers = { 'user-agent': 'skilld.dev social ingest (+https://skilld.dev)' }
  const data = await $fetch<RedditListing<RedditPostData | RedditCommentData>[]>(jsonUrl, { headers })

  const postNode = data[0]?.data?.children?.[0]?.data as RedditPostData | undefined
  if (!postNode)
    throw createError({ statusCode: 404, message: 'Reddit post not found' })

  if (commentMatch) {
    const commentId = commentMatch[3]!
    const children = (data[1]?.data?.children ?? []) as RedditChild<RedditCommentData>[]
    const commentNode = findComment(children, commentId)
    if (!commentNode)
      throw createError({ statusCode: 404, message: 'Reddit comment not found in thread' })
    return {
      platform: 'reddit',
      postId: commentNode.id,
      postUrl: `https://www.reddit.com${commentNode.permalink}`,
      authorHandle: commentNode.author,
      authorDisplayName: null,
      authorAvatar: null,
      textExtract: commentNode.body.trim(),
      title: postNode.title,
      oembedHtml: null,
      bskyUri: null,
      bskyCid: null,
      subreddit: commentNode.subreddit,
      redditKind: 'comment',
      score: commentNode.score,
      postedAt: commentNode.created_utc,
    }
  }

  return {
    platform: 'reddit',
    postId: postNode.id,
    postUrl: `https://www.reddit.com${postNode.permalink}`,
    authorHandle: postNode.author,
    authorDisplayName: null,
    authorAvatar: null,
    textExtract: (postNode.selftext || postNode.title).trim(),
    title: postNode.title,
    oembedHtml: null,
    bskyUri: null,
    bskyCid: null,
    subreddit: postNode.subreddit,
    redditKind: 'post',
    score: postNode.score,
    postedAt: postNode.created_utc,
  }
}

interface RedditCommentNode {
  kind: string
  data: RedditCommentData & { replies?: RedditListing<RedditCommentData> | '' }
}

function findComment(children: RedditChild<RedditCommentData>[], targetId: string): RedditCommentData | null {
  for (const child of children) {
    const node = child as RedditCommentNode
    if (node.kind !== 't1')
      continue
    if (node.data.id === targetId)
      return node.data
    const replies = node.data.replies
    if (replies && typeof replies === 'object') {
      const found = findComment(replies.data.children, targetId)
      if (found)
        return found
    }
  }
  return null
}

export async function fetchSocialPost(url: string): Promise<SocialPostFetched> {
  const platform = detectPlatform(url)
  if (platform === 'twitter')
    return fetchTwitter(url)
  if (platform === 'bsky')
    return fetchBluesky(url)
  if (platform === 'reddit')
    return fetchReddit(url)
  throw createError({ statusCode: 400, message: 'Unsupported URL (must be x.com, bsky.app, or reddit.com)' })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim()
}
