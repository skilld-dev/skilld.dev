<script setup lang="ts">
interface Props {
  platform: 'twitter' | 'bsky' | 'reddit'
  postUrl: string
  authorHandle: string
  authorDisplayName?: string | null
  authorAvatar?: string | null
  textExtract: string
  title?: string | null
  bskyUri?: string | null
  bskyCid?: string | null
  subreddit?: string | null
  redditKind?: 'post' | 'comment' | null
  postedAt?: number | null
}

const props = defineProps<Props>()

const SCRIPT_SRC: Record<Props['platform'], string> = {
  twitter: 'https://platform.twitter.com/widgets.js',
  bsky: 'https://embed.bsky.app/static/embed.js',
  reddit: 'https://embed.reddit.com/widgets.js',
}

// Load the platform's widget script lazily on visibility. The embed scripts
// each scan the DOM for their own blockquote class and progressively enhance
// the SSR markup we render below.
useScript({ src: SCRIPT_SRC[props.platform], crossorigin: 'anonymous' }, {
  trigger: 'onNuxtReady',
})

const platformLabel = computed(() => {
  if (props.platform === 'twitter')
    return 'X'
  if (props.platform === 'bsky')
    return 'Bluesky'
  return 'Reddit'
})

const datetime = computed(() => props.postedAt ? new Date(props.postedAt * 1000).toISOString() : undefined)

const PLATFORM_ICON: Record<Props['platform'], string> = {
  twitter: 'i-simple-icons-x',
  bsky: 'i-simple-icons-bluesky',
  reddit: 'i-simple-icons-reddit',
}

const profileUrl = computed(() => {
  if (props.platform === 'twitter')
    return `https://x.com/${props.authorHandle}`
  if (props.platform === 'bsky')
    return `https://bsky.app/profile/${props.authorHandle}`
  return `https://www.reddit.com/user/${props.authorHandle}`
})
</script>

<template>
  <figure class="social-embed not-prose rounded-lg border border-default bg-elevated overflow-hidden">
    <!-- Author header (always visible, even before widget hydrates) -->
    <header class="flex items-center gap-2.5 px-4 pt-3 pb-2 border-b border-default/60">
      <a
        :href="profileUrl"
        target="_blank"
        rel="noopener"
        class="shrink-0"
        :aria-label="`@${authorHandle} profile`"
      >
        <img
          v-if="authorAvatar"
          :src="authorAvatar"
          :alt="`${authorDisplayName || authorHandle} avatar`"
          width="32"
          height="32"
          class="size-8 rounded-full border border-default"
          loading="lazy"
        >
        <div
          v-else
          class="flex size-8 items-center justify-center rounded-full bg-muted border border-default"
          aria-hidden="true"
        >
          <UIcon
            :name="PLATFORM_ICON[platform]"
            class="size-4 text-muted"
          />
        </div>
      </a>
      <div class="min-w-0 flex-1">
        <a
          :href="profileUrl"
          target="_blank"
          rel="noopener"
          class="block truncate text-sm font-medium hover:text-muted transition-colors"
        >
          {{ authorDisplayName || authorHandle }}
        </a>
        <a
          :href="profileUrl"
          target="_blank"
          rel="noopener"
          class="block truncate font-mono text-xs text-muted hover:text-default transition-colors"
        >
          {{ platform === 'reddit' ? 'u/' : '@' }}{{ authorHandle }}{{ subreddit ? ` · r/${subreddit}` : '' }}
        </a>
      </div>
      <UIcon
        :name="PLATFORM_ICON[platform]"
        class="size-4 text-muted shrink-0"
        :aria-label="platformLabel"
      />
    </header>

    <!-- Twitter / X -->
    <blockquote
      v-if="platform === 'twitter'"
      class="twitter-tweet"
      data-dnt="true"
      data-theme="dark"
    >
      <p>{{ textExtract }}</p>
      <footer>
        &mdash; {{ authorDisplayName || authorHandle }} (@{{ authorHandle }})
        <a
          :href="postUrl"
          rel="noopener"
        >{{ datetime ? new Date(datetime).toLocaleDateString() : 'View on X' }}</a>
      </footer>
    </blockquote>

    <!-- Bluesky -->
    <blockquote
      v-else-if="platform === 'bsky' && bskyUri && bskyCid"
      class="bluesky-embed"
      :data-bluesky-uri="bskyUri"
      :data-bluesky-cid="bskyCid"
    >
      <p>{{ textExtract }}</p>
      <footer>
        &mdash; {{ authorDisplayName || authorHandle }} (<a
          :href="`https://bsky.app/profile/${authorHandle}`"
          rel="noopener"
        >@{{ authorHandle }}</a>)
        <a
          :href="postUrl"
          rel="noopener"
        >
          <time
            v-if="datetime"
            :datetime="datetime"
          >{{ new Date(datetime).toLocaleDateString() }}</time>
          <span v-else>View on Bluesky</span>
        </a>
      </footer>
    </blockquote>

    <!-- Reddit -->
    <blockquote
      v-else-if="platform === 'reddit'"
      class="reddit-embed-bq"
      data-embed-height="500"
      :data-embed-showtitle="redditKind === 'post' ? 'true' : 'false'"
      :data-embed-parent="redditKind === 'comment' ? 'true' : 'false'"
    >
      <a :href="postUrl">
        {{ title || textExtract.slice(0, 120) }}
      </a>
      <p
        v-if="redditKind === 'comment' || (title && textExtract && textExtract !== title)"
        class="reddit-extract"
      >
        {{ textExtract }}
      </p>
      <footer>
        &mdash;
        <a
          v-if="subreddit"
          :href="`https://www.reddit.com/r/${subreddit}`"
          rel="noopener"
        >r/{{ subreddit }}</a>
        by u/{{ authorHandle }}
        <time
          v-if="datetime"
          :datetime="datetime"
        >{{ new Date(datetime).toLocaleDateString() }}</time>
      </footer>
    </blockquote>

    <!-- Fallback: plain quote (unknown / missing data) -->
    <div
      v-else
      class="p-4"
    >
      <p class="text-sm leading-relaxed">
        {{ textExtract }}
      </p>
      <p class="mt-2 text-xs text-muted">
        <a
          :href="postUrl"
          rel="noopener"
          class="hover:text-default"
        >
          @{{ authorHandle }} on {{ platformLabel }}
        </a>
      </p>
    </div>
  </figure>
</template>

<style scoped>
.social-embed :deep(.twitter-tweet),
.social-embed :deep(.bluesky-embed),
.social-embed :deep(.reddit-embed-bq) {
  margin: 0;
  padding: 1rem;
  font-size: 0.9rem;
  line-height: 1.5;
}
.social-embed :deep(footer) {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
.social-embed :deep(.reddit-extract) {
  margin-top: 0.5rem;
  color: var(--ui-text-muted);
}
</style>
