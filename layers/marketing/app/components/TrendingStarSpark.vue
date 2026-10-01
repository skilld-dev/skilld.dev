<script setup lang="ts">
import type { StarPoint } from '#shared/trending-range'

/**
 * A repository's stars across the board's window, small enough to sit in the
 * provenance line beside the star count.
 *
 * The same drawing as the Skill page's star trend: a rose line over a faint
 * fill, scaled to the window's own range. Stars never start from zero inside
 * a window, so a zero baseline would draw every repository as a flat line.
 *
 * The exact gain is one hover or tap away. Hover shows it on a pointer; a tap
 * focuses the element, and focus shows it too, so touch has a path to it.
 */
const { points } = defineProps<{
  points: readonly StarPoint[]
}>()

const WIDTH = 56
const HEIGHT = 16
const PADDING = 1.5
const DAY = 86_400

const plotted = computed(() => {
  if (points.length < 2)
    return []
  const firstDay = points[0]!.day
  const dayRange = Math.max(1, points.at(-1)!.day - firstDay)
  const min = Math.min(...points.map(point => point.stars))
  const valueRange = Math.max(1, Math.max(...points.map(point => point.stars)) - min)
  return points.map(point => ({
    x: PADDING + (point.day - firstDay) / dayRange * (WIDTH - PADDING * 2),
    y: HEIGHT - PADDING - (point.stars - min) / valueRange * (HEIGHT - PADDING * 2),
  }))
})

const line = computed(() => plotted.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' '))
const area = computed(() => (line.value ? `${line.value} L${WIDTH - PADDING} ${HEIGHT} L${PADDING} ${HEIGHT} Z` : ''))

const label = computed(() => {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last)
    return ''
  const gained = last.stars - first.stars
  const days = Math.round((last.day - first.day) / DAY)
  const sign = gained >= 0 ? '+' : '−'
  return `${sign}${Math.abs(gained).toLocaleString()} stars in ${days} ${days === 1 ? 'day' : 'days'}`
})
</script>

<template>
  <span
    v-if="line"
    class="star-spark"
    tabindex="0"
    role="img"
    :aria-label="label"
  >
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="star-spark__chart"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path :d="area" fill="currentColor" fill-opacity="0.12" />
      <path
        :d="line"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <span class="star-spark__tip" aria-hidden="true">{{ label }}</span>
  </span>
</template>

<style scoped>
.star-spark {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding-block: 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-primary);
  cursor: default;
}

.star-spark__chart {
  inline-size: 3.5rem;
  block-size: 1rem;
  overflow: visible;
}

/*
 * The UiTooltip surface, drawn in CSS so it needs no client state: it shows on
 * hover and on focus, and a tap on touch focuses the element.
 *
 * Anchored to the chart's right edge so it grows leftward. Centred, a hidden
 * tip near the right edge still widened the page, and on a phone that meant
 * a sideways scroll.
 */
.star-spark__tip {
  position: absolute;
  inset-block-end: calc(100% + 0.25rem);
  inset-inline-end: 0;
  z-index: 10;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--ui-text);
  opacity: 0;
  pointer-events: none;
  transform: translateY(0.25rem);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.star-spark:hover .star-spark__tip,
.star-spark:focus .star-spark__tip {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .star-spark__tip {
    transform: none;
    transition: opacity 200ms;
  }
}
</style>
