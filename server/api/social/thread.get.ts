import { getPublicAgent } from '../../utils/atproto/agent'

interface ThreadReply {
  uri: string
  author: {
    did: string
    handle: string
    displayName?: string
    avatar?: string
  }
  text: string
  likeCount: number
  replyCount: number
  repostCount: number
  createdAt: string
}

interface ThreadResponse {
  post: {
    uri: string
    text: string
    likeCount: number
    replyCount: number
    repostCount: number
    createdAt: string
  }
  replies: ThreadReply[]
}

function extractReplies(thread: any, depth = 0): ThreadReply[] {
  const replies: ThreadReply[] = []
  if (!thread.replies || !Array.isArray(thread.replies))
    return replies

  for (const reply of thread.replies) {
    if (reply.$type !== 'app.bsky.feed.defs#threadViewPost' || !reply.post)
      continue

    const post = reply.post
    replies.push({
      uri: post.uri,
      author: {
        did: post.author.did,
        handle: post.author.handle,
        displayName: post.author.displayName,
        avatar: post.author.avatar,
      },
      text: post.record?.text ?? '',
      likeCount: post.likeCount ?? 0,
      replyCount: post.replyCount ?? 0,
      repostCount: post.repostCount ?? 0,
      createdAt: post.record?.createdAt ?? post.indexedAt,
    })

    // Flatten nested replies (one level deep for now)
    if (depth < 1)
      replies.push(...extractReplies(reply, depth + 1))
  }

  return replies
}

export default defineEventHandler(async (event): Promise<ThreadResponse> => {
  const query = getQuery(event)
  const uri = query.uri as string | undefined
  if (!uri || !uri.startsWith('at://'))
    throw createError({ statusCode: 400, message: 'Missing or invalid AT URI' })

  const cached = await useStorage('cache').getItem<ThreadResponse>(`thread:${uri}`)
  if (cached)
    return cached

  const agent = getPublicAgent()
  const res = await agent.app.bsky.feed.getPostThread({ uri, depth: 10 })
    .catch(() => null)

  if (!res || res.data.thread.$type !== 'app.bsky.feed.defs#threadViewPost')
    throw createError({ statusCode: 404, message: 'Thread not found' })

  const thread = res.data.thread as any
  const rootPost = thread.post

  const response: ThreadResponse = {
    post: {
      uri: rootPost.uri,
      text: rootPost.record?.text ?? '',
      likeCount: rootPost.likeCount ?? 0,
      replyCount: rootPost.replyCount ?? 0,
      repostCount: rootPost.repostCount ?? 0,
      createdAt: rootPost.record?.createdAt ?? rootPost.indexedAt,
    },
    replies: extractReplies(thread),
  }

  // Cache for 5 minutes
  await useStorage('cache').setItem(`thread:${uri}`, response, { ttl: 300 })

  return response
})
