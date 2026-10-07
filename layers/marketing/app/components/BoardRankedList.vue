<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import TrendingBoardItem from './TrendingBoardItem.vue'
import TrendingWeeklyCta from './TrendingWeeklyCta.vue'

/**
 * One ranked list of board rows, with the narrow screen's weekly invitation.
 *
 * Wide screens carry the invitation in the sidebar. Narrow ones have no
 * sidebar, and above the board it pushed the first Skill below the fold, so
 * it waits until a reader has seen the head of the list. A list no longer
 * than its head carries it at the end instead. A page renders it in one list
 * only, so it stays the page's one acquisition CTA.
 */
const { rows, start = 1, showWeeklyCta = false, ctaPending = false, surface } = defineProps<{
  rows: readonly TrendingBoardRow[]
  /** One-based rank of the first row. */
  start?: number
  showWeeklyCta?: boolean
  /** The session has not loaded, so the invitation holds its space unseen. */
  ctaPending?: boolean
  /** Analytics surface for each row's run chip, such as `trending-row`. */
  surface: string
}>()

const emit = defineEmits<{
  /** The owner's avatar failed, which means the GitHub account is gone. */
  avatarError: [owner: string]
}>()

/** Rows above the invitation on narrow screens. */
const HEAD_ROWS = 5

interface ListChunk {
  /** One-based rank of the chunk's first row, for the `<ol start>`. */
  start: number
  rows: readonly TrendingBoardRow[]
}

const chunks = computed<ListChunk[]>(() => [
  { start, rows: rows.slice(0, HEAD_ROWS) },
  { start: start + HEAD_ROWS, rows: rows.slice(HEAD_ROWS) },
].filter(chunk => chunk.rows.length > 0))
</script>

<template>
  <template v-for="(chunk, chunkIndex) in chunks" :key="chunk.start">
    <div
      v-if="chunkIndex === 1 && showWeeklyCta"
      class="board-cta--inline"
      :class="{ invisible: ctaPending }"
    >
      <TrendingWeeklyCta />
    </div>
    <ol class="board-list editorial-ledger list-none p-0" :start="chunk.start">
      <li v-for="(row, offset) in chunk.rows" :key="row.key">
        <TrendingBoardItem
          v-if="chunkIndex === 0"
          :row="row"
          :rank="chunk.start + offset"
          :surface="surface"
          @avatar-error="owner => emit('avatarError', owner)"
        />
        <!--
          Rows past the head render on the server with every post, and hydrate
          once they scroll into view. Hydrating all thirty rows at once was
          the board's longest task.
        -->
        <LazyTrendingBoardItem
          v-else
          hydrate-on-visible
          :row="row"
          :rank="chunk.start + offset"
          :surface="surface"
          @avatar-error="(owner: string) => emit('avatarError', owner)"
        />
      </li>
    </ol>
  </template>
  <div
    v-if="chunks.length === 1 && showWeeklyCta"
    class="board-cta--inline"
    :class="{ invisible: ctaPending }"
  >
    <TrendingWeeklyCta />
  </div>
</template>

<style scoped>
.board-list {
  margin: 0;
}

.board-cta--inline {
  margin-block: 1.5rem;
}

/*
 * The two halves of one list. Where nothing shows between them, the second
 * drops its top rule rather than doubling the first one's bottom: always when
 * no invitation renders, and on wide screens, where it moves to the sidebar.
 */
.board-list + .board-list {
  border-top: 0;
}

@media (min-width: 64rem) {
  .board-cta--inline {
    display: none;
  }

  .board-list ~ .board-list {
    border-top: 0;
  }
}
</style>
