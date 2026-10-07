<script setup lang="ts">
import type { TrendingBoardRow, TrendingPost } from '#shared/trending-range'
import { avatarProxyUrl } from '#shared/image-proxy'
import { postExcerpt } from '#shared/trending-post'
import WhyPanel from './_WhyPanel.vue'

/**
 * The head of the trending board, drawn small: the Skill, the faces of the
 * devs who posted about it, and the first post in their words. Under it, the
 * two signals side by side, so the picture says which one ranks.
 *
 * The row is live: the caller passes the first row ranked by posts. Without
 * one, only the signals show, because a made-up row would put words in a real
 * dev's mouth. The spark's today column is the one rose element.
 */
const { row } = defineProps<{
  row: TrendingBoardRow | null
}>()

/** Circles before the stack counts the rest, as on the board. */
const MAX_FACES = 3

const posts = computed<readonly TrendingPost[]>(() => row?.reason._tag === 'posts' ? row.reason.posts : [])
const mentionsByDay = computed(() => row?.reason._tag === 'posts' ? row.reason.mentionsByDay : null)
const faces = computed(() => posts.value.slice(0, posts.value.length > MAX_FACES ? MAX_FACES - 1 : MAX_FACES))
const rest = computed(() => posts.value.length - faces.value.length)
const firstPost = computed(() => posts.value[0] ?? null)
const excerpt = computed(() => firstPost.value
  ? postExcerpt({ text: firstPost.value.text, names: row?.names ?? [], budget: 90 })
  : [])
</script>

<template>
  <WhyPanel label="skilld.dev/skills/trending">
    <NuxtLink v-if="row && firstPost" :to="row.to" class="why-devs__row">
      <span class="why-devs__rank" aria-hidden="true">1</span>
      <span class="min-w-0 flex-1">
        <span class="why-devs__name-line">
          <span class="why-devs__name">/{{ row.name }}</span>
          <BrailleSpark v-if="mentionsByDay" :counts="mentionsByDay" :show-total="false" />
        </span>
        <span class="why-devs__by">{{ row.owner }}/{{ row.repo }}</span>
        <span class="why-devs__posts">
          <span class="why-devs__faces" aria-hidden="true">
            <span v-for="post in faces" :key="post.url" class="why-devs__face">
              <img
                v-if="post.authorAvatar"
                :src="avatarProxyUrl(post.authorAvatar)"
                alt=""
                width="18"
                height="18"
                loading="lazy"
                decoding="async"
              >
              <template v-else>{{ post.handle.slice(0, 1).toUpperCase() }}</template>
            </span>
            <span v-if="rest > 0" class="why-devs__face why-devs__face--rest">+{{ rest }}</span>
          </span>
          <span class="why-devs__quote">
            <span class="why-devs__handle">@{{ firstPost.handle }}</span>
            <template v-for="(segment, index) in excerpt" :key="index">
              <mark v-if="segment._tag === 'mention'" class="why-devs__mention">{{ segment.value }}</mark>
              <template v-else>{{ segment.value }}</template>
            </template>
          </span>
        </span>
      </span>
    </NuxtLink>

    <ul class="why-devs__signals" :class="{ 'why-devs__signals--alone': !row || !firstPost }" aria-label="What orders the board">
      <li class="why-devs__signal">
        <UIcon name="i-lucide-message-circle" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span>Devs who posted about it</span>
        <span class="why-devs__verdict">ranks</span>
      </li>
      <li class="why-devs__signal why-devs__signal--off">
        <UIcon name="i-lucide-download" class="size-3.5 shrink-0" aria-hidden="true" />
        <s>Install count</s>
        <span class="why-devs__verdict">never ranks</span>
      </li>
    </ul>
  </WhyPanel>
</template>

<style scoped>
.why-devs__row {
  display: flex;
  min-width: 0;
  gap: 0.75rem;
  margin: -0.25rem -0.375rem 0;
  padding: 0.25rem 0.375rem 0.5rem;
  border-radius: calc(var(--ui-radius) * 0.75);
  transition: background-color 200ms ease-out;
}

@media (hover: hover) {
  .why-devs__row:hover {
    background: var(--ui-bg-elevated);
  }
}

.why-devs__row:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.why-devs__rank {
  flex: none;
  width: 1rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  font-variant-numeric: tabular-nums;
}

.why-devs__name-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.why-devs__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.why-devs__by {
  display: block;
  color: var(--ui-text-dimmed);
}

.why-devs__posts {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.why-devs__faces {
  display: inline-flex;
  flex: none;
}

.why-devs__face {
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  overflow: hidden;
  border: 2px solid var(--ui-bg);
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  font-size: 0.5625rem;
  color: var(--ui-text-muted);
}

.why-devs__face + .why-devs__face {
  margin-left: -0.375rem;
}

.why-devs__face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.why-devs__quote {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  color: var(--ui-text-muted);
}

.why-devs__handle {
  margin-right: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
}

.why-devs__mention {
  background: none;
  color: var(--ui-text-toned);
}

.why-devs__row {
  margin-bottom: 0.75rem;
}

/* Pinned to the foot when a grid stretches the panel. */
.why-devs__signals {
  display: grid;
  gap: 0.25rem;
  margin: auto 0 0;
  padding: 0.75rem 0 0;
  border-top: 1px dashed var(--ui-border);
  list-style: none;
}

.why-devs__signals--alone {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.why-devs__signal {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
  color: var(--ui-text);
}

.why-devs__signal--off {
  color: var(--ui-text-dimmed);
}

.why-devs__signal--off s {
  text-decoration-color: var(--ui-text-dimmed);
}

.why-devs__verdict {
  margin-left: auto;
  color: var(--ui-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .why-devs__row {
    transition: none;
  }
}
</style>
