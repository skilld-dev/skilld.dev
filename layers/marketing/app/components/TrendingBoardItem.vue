<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import TrendingPostCarousel from './TrendingPostCarousel.vue'
import TrendingStarSpark from './TrendingStarSpark.vue'

/**
 * One board entry: the Skill on the left, the posts about it on the right.
 *
 * The row used to stack eight lines in five type styles, and the quoted post,
 * set brighter than the description, was the loudest text in it. Now the
 * Skill carries the weight, larger and first, and the posts sit beside it as
 * testimony, one card at a time.
 */
const { row, rank } = defineProps<{
  row: TrendingBoardRow
  /** One-based position on the board. */
  rank: number
}>()

const emit = defineEmits<{
  /** The owner's avatar failed, which means the GitHub account is gone. */
  avatarError: [owner: string]
}>()

const posts = computed(() => (row.reason._tag === 'posts' ? row.reason.posts : []))
</script>

<template>
  <div class="board-row" :class="{ 'board-row--with-posts': posts.length > 0 }">
    <!-- The list is an `<ol>`, so a screen reader already announces the position. -->
    <span
      class="board-row__rank"
      :class="{ 'board-row__rank--lead': rank <= 3 }"
      aria-hidden="true"
    >{{ String(rank).padStart(2, '0') }}</span>

    <div class="board-row__skill">
      <NuxtLink :to="row.to" class="board-row__name">
        {{ row.title }}
      </NuxtLink>
      <p class="board-row__meta">
        <img
          :src="githubAvatarProxyUrl(row.owner, 40)"
          alt=""
          width="18"
          height="18"
          class="size-[1.125rem] shrink-0 rounded-full border border-default bg-muted"
          loading="lazy"
          decoding="async"
          @error="emit('avatarError', row.owner)"
        >
        <span v-if="row.subtitle" class="truncate">{{ row.subtitle }}</span>
        <span v-if="row.stars" class="shrink-0 tabular-nums">{{ `${row.stars.toLocaleString()} ★` }}</span>
        <TrendingStarSpark :points="row.starSeries" />
        <template v-if="row.reason._tag === 'reviewed'">
          <span class="shrink-0">{{ `${row.reason.skillCount.toLocaleString()} ${row.reason.skillCount === 1 ? 'skill' : 'skills'}` }}</span>
          <span v-if="row.reason.updated" class="shrink-0">Updated {{ row.reason.updated }}</span>
        </template>
        <!--
          The two reasons with no post say why the row is here in words, since
          nothing beside them does. A surge has only its stars; filler has to
          say it is filler, or a popular repository passes for a trending one.
        -->
        <span v-else-if="row.reason._tag === 'surge'" class="shrink-0 text-default">
          {{ `+${row.reason.gain.toLocaleString()} stars this week` }}<template v-if="row.reason.when">, {{ row.reason.when }}</template>
        </span>
        <span v-else-if="row.reason._tag === 'filler'" class="shrink-0">Popular on GitHub</span>
      </p>
      <p v-if="row.description" class="board-row__description">
        {{ row.description }}
      </p>
    </div>

    <TrendingPostCarousel
      v-if="posts.length"
      class="board-row__posts"
      :posts="posts"
      :names="row.names"
      :label="`Posts about ${row.title}`"
    />
  </div>
</template>

<style scoped>
/*
 * Narrow first: the rank sits in a gutter and the posts stack under the
 * Skill, so the Skill name, never a post, is the first thing under each rank.
 */
.board-row {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  column-gap: 0.75rem;
  row-gap: 1rem;
  align-items: start;
  padding-block: 1.5rem;
}

.board-row__skill,
.board-row__posts {
  grid-column: 2;
  min-inline-size: 0;
}

/*
 * Printed in the dot grid and inked rose, the brand numerals, at a size where
 * the dots read as a number. At 18px and half opacity the old rank read as
 * texture, on a page whose whole structure is an order.
 */
.board-row__rank {
  grid-row: 1 / span 2;
  padding-top: 0.125rem;
  font-family: var(--font-mono);
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ui-primary);
  opacity: 0.55;
  mask-image: radial-gradient(circle, #000 1.1px, transparent 1.4px);
  mask-size: 3px 3px;
}

.board-row__rank--lead {
  opacity: 1;
}

.board-row__name {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.015em;
  color: var(--ui-text-highlighted);
  overflow-wrap: anywhere;
  transition: opacity 200ms;
}

@media (hover: hover) {
  .board-row__name:hover {
    opacity: 0.7;
  }
}

.board-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.625rem;
  min-inline-size: 0;
  margin-top: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.board-row__description {
  display: -webkit-box;
  margin-top: 0.625rem;
  overflow: hidden;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--ui-text-muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

@media (min-width: 64rem) {
  .board-row {
    grid-template-columns: 3rem minmax(0, 1fr);
    column-gap: 2rem;
  }

  .board-row--with-posts {
    grid-template-columns: 3rem minmax(0, 1fr) minmax(0, 21rem);
  }

  .board-row__rank {
    grid-row: 1;
    font-size: 1.5rem;
  }

  .board-row__posts {
    grid-column: 3;
    grid-row: 1;
  }

  /* Beside the posts there is room for a third line of the author's own words. */
  .board-row__description {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
}
</style>
