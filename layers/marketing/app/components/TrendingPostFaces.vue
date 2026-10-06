<script setup lang="ts">
import type { TrendingPost } from '#shared/trending-range'
import { avatarProxyUrl } from '#shared/image-proxy'

/**
 * The people who posted about a Skill, as overlapping faces, and the toggle
 * that opens their posts.
 *
 * Never more than three circles, so every row's quote starts in the same
 * place. Past three posts the third circle counts the rest. The faces carry
 * the count, which is why the spark beside the name drops its own.
 */
const { posts, open, controls, label } = defineProps<{
  posts: readonly TrendingPost[]
  /** Whether the posts it controls are showing. */
  open: boolean
  /** Id of the element holding the posts. */
  controls: string
  /** Accessible name, such as "6 posts about /brag". */
  label: string
}>()

const emit = defineEmits<{
  toggle: []
}>()

/** Circles in the stack at most. */
const MAX_CIRCLES = 3

const faces = computed(() => posts.slice(0, posts.length > MAX_CIRCLES ? MAX_CIRCLES - 1 : MAX_CIRCLES))
const rest = computed(() => posts.length - faces.value.length)
</script>

<template>
  <button
    type="button"
    class="post-faces"
    :aria-expanded="open"
    :aria-controls="controls"
    :aria-label="label"
    @click="emit('toggle')"
  >
    <span class="post-faces__stack" aria-hidden="true">
      <span v-for="post in faces" :key="post.url" class="post-faces__circle">
        <img
          v-if="post.authorAvatar"
          :src="avatarProxyUrl(post.authorAvatar)"
          alt=""
          width="20"
          height="20"
          loading="lazy"
          decoding="async"
        >
        <template v-else>{{ post.handle.slice(0, 1).toUpperCase() }}</template>
      </span>
      <span v-if="rest > 0" class="post-faces__circle post-faces__rest">+{{ rest }}</span>
    </span>
    <UIcon name="i-lucide-chevron-down" class="post-faces__chevron size-3.5" :class="{ 'post-faces__chevron--open': open }" aria-hidden="true" />
  </button>
</template>

<style scoped>
.post-faces {
  display: inline-flex;
  flex: none;
  min-block-size: 1.75rem;
  align-items: center;
  gap: 0.25rem;
  margin-block: -0.25rem;
  margin-inline-start: -0.25rem;
  padding-inline: 0.25rem;
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
  transition: background-color 200ms ease-out, color 200ms ease-out;
}

@media (hover: hover) {
  .post-faces:hover {
    background: var(--ui-bg-muted);
    color: var(--ui-text);
  }
}

@media (pointer: coarse) {
  .post-faces {
    min-block-size: 2.75rem;
  }
}

.post-faces__stack {
  display: inline-flex;
  align-items: center;
}

/* Each circle ringed in the page colour, so the overlap reads as a stack. */
.post-faces__circle {
  display: inline-flex;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9999px;
  outline: 2px solid var(--ui-bg);
  background: var(--ui-bg-accented);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  color: var(--ui-text-muted);
}

.post-faces__circle + .post-faces__circle {
  margin-inline-start: -0.375rem;
}

.post-faces__circle img {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.post-faces__rest {
  font-size: 0.5625rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--ui-text);
}

.post-faces__chevron {
  transition: transform 200ms ease-out;
}

.post-faces__chevron--open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .post-faces,
  .post-faces__chevron {
    transition: none;
  }
}
</style>
