<script setup lang="ts">
import type { SparkUnit } from '#shared/braille-spark'
import { SPARK_BARS, SPARK_MENTIONS, sparkCount, sparkLevels, sparkWeek } from '#shared/braille-spark'

/**
 * Seven days of counts as seven braille bars, today in rose, with the count
 * beside them. The bars are text from `shared/braille-spark.ts`, so the weekly
 * email and any plain-text surface print the same spark.
 *
 * A day with no count draws the lowest bar faintly, as a track. Plain text
 * leaves that day blank, and on the page a week with one post became one bar
 * floating in a gap, with nothing to say it was a week.
 */
const {
  counts,
  total,
  unit = SPARK_MENTIONS,
  period,
  showUnit = true,
} = defineProps<{
  /** Seven daily counts, oldest first, today last. */
  counts: readonly number[]
  /** The count beside the bars. Defaults to the sum of the seven days. */
  total?: number
  /** What is counted, in both forms. The screen reader label always names it. */
  unit?: SparkUnit
  /** The window the count covers, such as `in 7 days`. It follows the noun. */
  period?: string
  /** Show the unit after the count. Hide it only where a column heading names it. */
  showUnit?: boolean
}>()

const week = computed(() => sparkWeek(counts))
const cells = computed(() => sparkLevels(counts).map(level => ({
  glyph: SPARK_BARS[level === 0 ? 1 : level],
  empty: level === 0,
})))
const shown = computed(() => total ?? week.value.reduce((sum, count) => sum + count, 0))
const counted = computed(() => [sparkCount(shown.value, unit), period].filter(Boolean).join(' '))
const totalText = computed(() => showUnit ? counted.value : shown.value.toLocaleString('en-US'))
const label = computed(() => `${counted.value}. Per day, oldest first: ${week.value.join(', ')}. Today: ${week.value.at(-1)}.`)
</script>

<template>
  <span class="braille-spark" role="img" :aria-label="label">
    <span class="braille-spark__bars" aria-hidden="true"><span v-for="(cell, index) in cells" :key="index" :class="cell.empty ? 'braille-spark__track' : index === cells.length - 1 && 'braille-spark__today'">{{ cell.glyph }}</span></span>
    <span class="braille-spark__total" aria-hidden="true">{{ totalText }}</span>
  </span>
</template>

<style scoped>
.braille-spark {
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* IBM Plex Mono has no braille, so the bars fall through to a face that does. */
.braille-spark__bars {
  font-family: 'IBM Plex Mono', 'DejaVu Sans Mono', 'Apple Braille', 'Segoe UI Symbol', ui-monospace, monospace;
  font-size: 0.875rem;
  line-height: 1;
  /* Muted, not dimmed: the bars are a graphic and need 3:1 against the surface. */
  color: var(--ui-text-muted);
}

/*
 * The track is not data: it only shows where the week runs, and the label
 * carries the count. A fraction of the bar colour, not the dimmed token: in
 * dark mode dimmed sits within a step of muted, and a quiet day read as none.
 */
.braille-spark__track {
  opacity: 0.4;
}

.braille-spark__today {
  color: var(--brand-dot);
}
</style>
