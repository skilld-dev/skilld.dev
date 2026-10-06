<script setup lang="ts">
/**
 * Columns of braille dots, one column per value, filled from the bottom.
 *
 * The braille spark and the trending mark draw with it. As braille text, each
 * bar was a full two-column cell in a fallback font, with a gap inside every
 * bar. Seven days measured 70px in headless Chrome on Linux, and the width
 * changed per system. One column of dots per day draws them in 20px.
 * Plain-text surfaces keep the braille characters; see `braille-spark.ts`.
 */
const { levels, accent = true } = defineProps<{
  /** One level per column, from 0 to 4. Level 0 draws one faint track dot. */
  levels: readonly number[]
  /** Ink the last column rose. Off where the surface already spends its rose. */
  accent?: boolean
}>()

const ROWS = 4
const DOT = 2
const PITCH = 3

const width = computed(() => levels.length * PITCH - (PITCH - DOT))
const height = ROWS * PITCH - (PITCH - DOT)

const dots = computed(() => levels.flatMap((level, column) => {
  const kind = level === 0 ? 'track' : accent && column === levels.length - 1 ? 'today' : 'bar'
  return Array.from({ length: Math.min(Math.max(level, 1), ROWS) }, (_, row) => ({
    key: `${column}-${row}`,
    x: column * PITCH,
    y: height - DOT - row * PITCH,
    kind,
  }))
}))
</script>

<template>
  <svg
    class="spark-dots"
    :viewBox="`0 0 ${width} ${height}`"
    :width
    :height
    aria-hidden="true"
  >
    <rect
      v-for="dot in dots"
      :key="dot.key"
      :x="dot.x"
      :y="dot.y"
      :width="DOT"
      :height="DOT"
      rx="1"
      :class="`spark-dots__${dot.kind}`"
    />
  </svg>
</template>

<style scoped>
/* Muted, not dimmed: the dots are a graphic and need 3:1 against the surface. */
.spark-dots {
  display: inline-block;
  flex: none;
  overflow: visible;
  color: var(--ui-text-muted);
}

.spark-dots rect {
  fill: currentColor;
}

/*
 * The track is not data: it only shows where the week runs. A fraction of the
 * dot colour, not the dimmed token: in dark mode dimmed sits within a step of
 * muted, and a quiet day read as none.
 */
.spark-dots .spark-dots__track {
  opacity: 0.4;
}

.spark-dots .spark-dots__today {
  fill: var(--brand-dot);
}

@media (forced-colors: active) {
  .spark-dots rect,
  .spark-dots .spark-dots__today {
    fill: CanvasText;
  }
}
</style>
