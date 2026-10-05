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

/**
 * Each row draws the signal that ranked it, and only that one. Mentions ranked
 * a row with posts, so it gets the braille spark. Stars ranked a surge or a
 * filler row, so those keep the star line. Two charts on one line would ask the
 * reader which one put the row here.
 *
 * A month board ranks posts older than the spark's seven days. A week of
 * blank cells draws nothing beside a bare zero, so that row shows no spark and
 * its posts carry their own dates.
 */
const isSocial = computed(() => row.reason._tag === 'posts')
const mentions = computed(() => {
  const days = row.reason._tag === 'posts' ? row.reason.mentionsByDay : null
  return days?.some(count => count > 0) ? days : null
})
/** Whether the last slot of the metadata line has anything to say. */
const hasSignal = computed(() => !isSocial.value || mentions.value !== null)
</script>

<template>
  <div class="board-item">
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
        <!--
          Three slots in one order on every row: where the Skill lives, its
          stars, then why it is on the board. A slot with nothing to say
          renders nothing, and the last slot drops to its own line as a whole
          when the row is too narrow for all three.
        -->
        <p class="board-row__meta">
          <span class="board-row__source">
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
            <span v-if="row.subtitle" class="truncate" :title="row.subtitle">{{ row.subtitle }}</span>
          </span>
          <span v-if="row.stars" class="board-row__stars">
            <span>{{ `${row.stars.toLocaleString()} ★` }}</span>
            <TrendingStarSpark v-if="!isSocial" :points="row.starSeries" />
          </span>
          <span v-if="hasSignal" class="board-row__signal">
            <BrailleSpark v-if="mentions" :counts="mentions" period="in 7 days" />
            <template v-else-if="row.reason._tag === 'reviewed'">
              <span>{{ `${row.reason.skillCount.toLocaleString()} ${row.reason.skillCount === 1 ? 'skill' : 'skills'}` }}</span>
              <span v-if="row.reason.updated">Updated {{ row.reason.updated }}</span>
            </template>
            <!--
              The two reasons with no post say why the row is here in words, since
              nothing beside them does. A surge has only its stars; filler has to
              say it is filler, or a popular repository passes for a trending one.
            -->
            <span v-else-if="row.reason._tag === 'surge'" class="board-row__surge">
              {{ `Star surge: +${row.reason.gain.toLocaleString()} stars in a day` }}<template v-if="row.reason.when">, {{ row.reason.when }}</template>
            </span>
            <span v-else-if="row.reason._tag === 'filler'">Popular on GitHub</span>
          </span>
        </p>
        <p v-if="row.description" class="board-row__description">
          {{ row.description }}
        </p>
        <!-- Only where the row stands for exactly one Skill; see `singleSkill`. -->
        <RunChip
          v-if="row.skill"
          class="board-row__run"
          :owner="row.skill.owner"
          :repo="row.skill.repo"
          :skill="row.skill.name"
          surface="trending-row"
          variant="compact"
        />
      </div>

      <TrendingPostCarousel
        v-if="posts.length"
        class="board-row__posts"
        :posts="posts"
        :names="row.names"
        :label="`Posts about ${row.title}`"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * The row answers to the width it gets, not the viewport's. The board shares
 * the page with a sidebar on wide screens, so a viewport breakpoint put the
 * posts beside the Skill in a column too narrow for either.
 */
.board-item {
  container: board-item / inline-size;
}

/*
 * Narrow first: the rank sits in a gutter and the posts stack under the
 * Skill, so the Skill name, never a post, is the first thing under each rank.
 */
.board-row {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  column-gap: 0.75rem;
  row-gap: 1rem;
  align-items: start;
  padding-block: 1.25rem;
}

.board-row__skill,
.board-row__posts {
  grid-column: 2;
  min-inline-size: 0;
}

/*
 * A plain number, quiet beside the name it ranks. It shares the name's
 * baseline, so the two read as one line. The first three are inked a step
 * darker, never in rose: the rose belongs to the motifs, one dot each.
 */
.board-row__rank,
.board-row__skill {
  grid-row: 1;
  align-self: baseline;
}

.board-row__rank {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted);
}

.board-row__rank--lead {
  font-weight: 600;
  color: var(--ui-text-highlighted);
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
  gap: 0.25rem 0.75rem;
  min-inline-size: 0;
  margin-top: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--ui-text-muted);
}

/*
 * The source line breaks as if it were 11rem wide, then grows back to its full
 * length where the line has room. So a long repository name gets cut short
 * before it pushes the stars or the signal onto a line of their own.
 */
.board-row__source {
  display: inline-flex;
  flex: 1 1 11rem;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
  max-inline-size: max-content;
}

.board-row__stars {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.board-row__signal {
  display: inline-flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  min-inline-size: 0;
  white-space: nowrap;
}

.board-row__surge {
  white-space: normal;
  color: var(--ui-text);
}

/* Capped for rows with no posts, which otherwise run the whole board wide. */
.board-row__description {
  display: -webkit-box;
  max-inline-size: 75ch;
  margin-top: 0.5rem;
  overflow: hidden;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

/* As wide as its command, not as wide as the column. */
.board-row__run {
  inline-size: fit-content;
  max-inline-size: 100%;
  margin-top: 0.75rem;
}

/*
 * Beside the Skill once the row is wide enough for both. The posts take what
 * the board has to spare, and the Skill column stays the wider one.
 */
@container board-item (min-width: 52rem) {
  .board-row {
    column-gap: 2rem;
  }

  .board-row--with-posts {
    grid-template-columns: 1.5rem minmax(0, 1.25fr) minmax(21rem, 1fr);
  }

  .board-row__posts {
    grid-column: 3;
    grid-row: 1;
  }
}
</style>
