<script setup lang="ts">
const { postUri } = defineProps<{
  postUri: string
}>()

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

const { data: thread, status } = useFetch<ThreadResponse>('/api/social/thread', {
  query: { uri: postUri },
  lazy: true,
})

// Convert AT URI to Bluesky web URL
const bskyUriRegex = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/(.+)$/
function bskyUrl(uri: string): string {
  // at://did:plc:xxx/app.bsky.feed.post/rkey -> https://bsky.app/profile/did:plc:xxx/post/rkey
  const match = uri.match(bskyUriRegex)
  if (!match)
    return '#'
  return `https://bsky.app/profile/${match[1]}/post/${match[2]}`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)
    return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24)
    return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
</script>

<template>
  <div>
    <!-- Root post engagement -->
    <div
      v-if="thread?.post"
      class="flex items-center gap-4 font-mono text-xs text-muted"
    >
      <span class="tabular-nums">{{ thread.post.likeCount }} likes</span>
      <span class="tabular-nums">{{ thread.post.replyCount }} replies</span>
      <span class="tabular-nums">{{ thread.post.repostCount }} reposts</span>
    </div>

    <!-- Replies -->
    <div
      v-if="status === 'pending'"
      class="mt-4 space-y-3"
      aria-busy="true"
    >
      <div
        v-for="i in 3"
        :key="i"
        class="flex gap-3"
      >
        <USkeleton class="size-7 shrink-0 rounded-full" />
        <div class="flex-1 space-y-1.5">
          <USkeleton class="h-3 w-24" />
          <USkeleton class="h-3 w-full" />
        </div>
      </div>
    </div>

    <div
      v-else-if="thread?.replies.length"
      class="mt-4 divide-y divide-default"
      role="list"
      aria-label="Discussion"
    >
      <div
        v-for="reply in thread.replies"
        :key="reply.uri"
        class="flex gap-3 py-3 first:pt-0"
        role="listitem"
      >
        <img
          v-if="reply.author.avatar"
          :src="reply.author.avatar"
          :alt="reply.author.displayName ?? reply.author.handle"
          width="28"
          height="28"
          class="size-7 shrink-0 rounded-full"
        >
        <div
          v-else
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted"
        >
          <UIcon
            name="i-lucide-user"
            class="size-3.5 text-muted"
            aria-hidden="true"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <a
              :href="`https://bsky.app/profile/${reply.author.handle}`"
              target="_blank"
              rel="noopener"
              class="text-sm font-medium truncate hover:underline"
            >
              {{ reply.author.displayName ?? reply.author.handle }}
            </a>
            <span class="font-mono text-xs text-muted shrink-0">
              {{ relativeTime(reply.createdAt) }}
            </span>
          </div>

          <p class="mt-0.5 text-sm text-muted leading-relaxed whitespace-pre-line">
            {{ reply.text }}
          </p>

          <div class="mt-1 flex items-center gap-3 font-mono text-xs text-muted">
            <span
              v-if="reply.likeCount"
              class="tabular-nums"
            >
              <UIcon
                name="i-lucide-heart"
                class="mr-0.5 inline size-3"
                aria-hidden="true"
              />{{ reply.likeCount }}
            </span>
            <a
              :href="bskyUrl(reply.uri)"
              target="_blank"
              rel="noopener"
              class="hover:text-default transition-colors"
            >
              reply
            </a>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="status === 'success' && !thread?.replies.length"
      class="mt-4 text-sm text-muted"
    >
      No replies yet. Be the first to comment on Bluesky.
    </div>

    <!-- CTA to join conversation -->
    <div
      v-if="thread?.post"
      class="mt-4"
    >
      <UButton
        :to="bskyUrl(thread.post.uri)"
        target="_blank"
        label="Join the conversation on Bluesky"
        icon="i-lucide-external-link"
        trailing
        variant="outline"
        color="neutral"
        size="sm"
        class="font-mono"
      />
    </div>
  </div>
</template>
