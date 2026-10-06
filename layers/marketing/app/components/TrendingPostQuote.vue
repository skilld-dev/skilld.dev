<script setup lang="ts">
import type { TrendingPost } from '#shared/trending-range'
import { postExcerpt } from '#shared/trending-post'

/**
 * One post as one line: who said it, then what they said, cut where the row
 * ends. The excerpt starts at the Skill's name when the post reaches it late,
 * so the line shows why the post counts.
 */
const { post, names } = defineProps<{
  post: TrendingPost
  /** Names the Skill answers to, marked where the post says them. */
  names: readonly string[]
}>()

/** Characters of excerpt. The line ends before this on most rows. */
const BUDGET = 110

const segments = computed(() => postExcerpt({ text: post.text, names, budget: BUDGET }))
</script>

<template>
  <a :href="post.url" target="_blank" rel="nofollow noopener" class="post-quote">
    <span class="post-quote__by">@{{ post.handle }}</span>
    <span class="post-quote__text">
      <template v-for="(segment, index) in segments" :key="index">
        <mark v-if="segment._tag === 'mention'" class="post-quote__mention">{{ segment.value }}</mark>
        <template v-else>{{ segment.value }}</template>
      </template>
    </span>
  </a>
</template>

<style scoped>
/* Basis zero, so in a wrapping line it shrinks beside the faces rather than dropping below them. */
.post-quote {
  display: flex;
  flex: 1 1 0;
  min-inline-size: 0;
  align-items: baseline;
  gap: 0.5rem;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--ui-text-muted);
}

.post-quote__by {
  flex: none;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
}

.post-quote__text {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 200ms ease-out;
}

@media (hover: hover) {
  .post-quote:hover .post-quote__text {
    color: var(--ui-text);
  }
}

.post-quote__mention {
  background: none;
  font-weight: 600;
  color: var(--ui-text);
}

@media (prefers-reduced-motion: reduce) {
  .post-quote__text {
    transition: none;
  }
}
</style>
