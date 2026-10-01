<script setup lang="ts">
import type { TrendingPost } from '#shared/trending-range'
// Explicit: motion-v also exports a `useScroll`, and the auto-import picked it.
import { usePreferredReducedMotion, useScroll } from '@vueuse/core'
import TrendingPostCard from './TrendingPostCard.vue'

/**
 * The posts about one Skill, one card at a time, scrolled sideways.
 *
 * It replaced a line reading "28 devs talked about it". A count asked the
 * reader to trust it; the posts themselves show it. Native scroll snapping
 * does the work, so every post is in the server HTML, a touch screen swipes
 * it, and focus on a card scrolls that card into view.
 *
 * The next card peeks in from the edge, which is what says there is more.
 */
const { posts, names, label } = defineProps<{
  posts: readonly TrendingPost[]
  /** Names the Skill answers to, marked where each post says them. */
  names: readonly string[]
  /** The list's accessible name, such as "Posts about brag". */
  label: string
}>()

const track = useTemplateRef<HTMLElement>('track')
const { x } = useScroll(track)
const motion = usePreferredReducedMotion()

/** Distance from one card to the next: its width plus the gap. */
function stride(): number {
  const element = track.value
  const first = element?.firstElementChild
  if (!element || !(first instanceof HTMLElement))
    return 0
  return first.offsetWidth + (Number.parseFloat(getComputedStyle(element).columnGap) || 0)
}

// Zero on the server and on first paint, so hydration always agrees.
const current = computed(() => {
  const size = stride()
  return size ? Math.min(posts.length - 1, Math.round(x.value / size)) : 0
})

function move(by: number) {
  track.value?.scrollBy({ left: by * stride(), behavior: motion.value === 'reduce' ? 'auto' : 'smooth' })
}
</script>

<template>
  <div class="post-carousel">
    <ul ref="track" class="post-carousel__track" :aria-label="label">
      <li
        v-for="post in posts"
        :key="post.url"
        class="post-carousel__slide"
        :class="{ 'post-carousel__slide--only': posts.length === 1 }"
      >
        <TrendingPostCard :post="post" :names="names" />
      </li>
    </ul>

    <div v-if="posts.length > 1" class="post-carousel__nav">
      <span class="post-carousel__count" aria-hidden="true">{{ current + 1 }} / {{ posts.length }}</span>
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        aria-label="Previous post"
        class="post-carousel__button"
        :disabled="current === 0"
        @click="() => move(-1)"
      />
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        aria-label="Next post"
        class="post-carousel__button"
        :disabled="current >= posts.length - 1"
        @click="() => move(1)"
      />
    </div>
  </div>
</template>

<style scoped>
.post-carousel {
  min-inline-size: 0;
}

.post-carousel__track {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.post-carousel__track::-webkit-scrollbar {
  display: none;
}

.post-carousel__slide {
  display: flex;
  flex: 0 0 88%;
  min-inline-size: 0;
  scroll-snap-align: start;
}

.post-carousel__slide--only {
  flex-basis: 100%;
}

.post-carousel__slide > * {
  flex: 1;
}

.post-carousel__nav {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.125rem;
  margin-top: 0.375rem;
}

.post-carousel__count {
  margin-inline-end: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

/* A touch screen swipes the track, so only a pointer gets the buttons. */
@media (hover: none) {
  .post-carousel__button {
    display: none;
  }
}
</style>
