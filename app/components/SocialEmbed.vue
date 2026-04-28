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
</script>

<template>
  <figure class="social-embed not-prose rounded-lg border border-default bg-elevated overflow-hidden">
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
