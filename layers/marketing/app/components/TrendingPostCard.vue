<script setup lang="ts">
import type { TrendingPost } from '#shared/trending-range'
import { avatarProxyUrl } from '#shared/image-proxy'
import { postExcerpt } from '#shared/trending-post'

/**
 * One post, laid out the way people already read posts: who said it, when,
 * and how it landed, then what they said.
 *
 * The board used to print the words first and the author last, in 12px mono,
 * so a reader met a stranger's sentence before knowing whose it was.
 *
 * It stays quieter than the Skill it supports: body-size muted text against
 * the Skill's larger name, and no surface fill. The post is testimony; the
 * Skill is the subject.
 */
const { post, names } = defineProps<{
  post: TrendingPost
  /** Names the Skill answers to, marked where the post says them. */
  names: readonly string[]
}>()

/** Lines of post text before the clamp. */
const LINES = 4

/**
 * Characters those lines hold at the narrowest card, about 42 a line. A first
 * mention past this moves the excerpt to it; see `postExcerpt`.
 */
const segments = computed(() => postExcerpt({ text: post.text, names, budget: LINES * 42 }))
const network = computed(() => (post.platform === 'bsky' ? 'Bluesky' : 'X'))

function likesLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'like' : 'likes'}`
}
</script>

<template>
  <a
    :href="post.url"
    rel="nofollow noopener"
    target="_blank"
    class="trending-post"
  >
    <span class="trending-post__head">
      <img
        v-if="post.authorAvatar"
        :src="avatarProxyUrl(post.authorAvatar)"
        alt=""
        width="18"
        height="18"
        class="size-[1.125rem] shrink-0 rounded-full bg-muted object-cover"
        loading="lazy"
        decoding="async"
      >
      <span class="trending-post__byline">
        <span v-if="post.authorName" class="trending-post__name">{{ post.authorName }}</span>
        <span class="trending-post__handle">@{{ post.handle }}</span>
      </span>
      <span class="trending-post__meta">{{ post.when }}</span>
      <svg
        class="trending-post__network"
        viewBox="0 0 24 24"
        fill="currentColor"
        role="img"
        :aria-label="`on ${network}`"
      >
        <path v-if="post.platform === 'bsky'" d="M12 10.8C10.913 8.686 7.954 4.747 5.202 2.805 2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8" />
        <path v-else d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z" />
      </svg>
    </span>
    <span class="trending-post__text line-clamp-4">
      <template v-for="(segment, index) in segments" :key="index">
        <mark v-if="segment._tag === 'mention'" class="trending-post__mention">{{ segment.value }}</mark>
        <template v-else>{{ segment.value }}</template>
      </template>
    </span>
    <span v-if="post.likes" class="trending-post__meta trending-post__likes">{{ likesLabel(post.likes) }}</span>
  </a>
</template>

<style scoped>
/*
 * Border-driven like every other card here, with no fill, so it reads as a
 * quotation beside the Skill rather than as a second subject. Hover moves the
 * border and nothing else.
 */
.trending-post {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-inline-size: 0;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  transition: border-color 200ms;
}

@media (hover: hover) {
  .trending-post:hover {
    border-color: var(--ui-text-muted);
  }
}

.trending-post__head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-inline-size: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.125rem;
}

.trending-post__byline {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  min-inline-size: 0;
  overflow: hidden;
  white-space: nowrap;
}

.trending-post__name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text);
}

.trending-post__handle {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-text);
}

.trending-post__name + .trending-post__handle {
  color: var(--ui-text-muted);
}

.trending-post__meta {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

.trending-post__likes {
  margin-top: auto;
}

.trending-post__network {
  flex-shrink: 0;
  inline-size: 0.75rem;
  block-size: 0.75rem;
  margin-inline-start: auto;
  color: var(--ui-text-muted);
}

/*
 * `pre-line` keeps the author's own line breaks, which is what makes a
 * numbered list read as a list. `postExcerpt` has already dropped the blank
 * lines between them, so four lines of clamp show four lines of words.
 */
.trending-post__text {
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
  color: var(--ui-text-muted);
}

/* The Skill's own name, inked like the homepage headline. */
.trending-post__mention {
  background: none;
  color: var(--ui-text);
  font-weight: 600;
  text-decoration-line: underline;
  text-decoration-color: color-mix(in oklab, var(--ui-primary) 65%, transparent);
  text-decoration-thickness: max(2px, 0.1em);
  text-underline-offset: 0.2em;
  text-decoration-skip-ink: none;
}

@media (forced-colors: active) {
  .trending-post {
    border-color: CanvasText;
  }
}
</style>
