<script setup lang="ts">
import type { SparkUnit } from '#shared/braille-spark'
import { SPARK_MENTIONS, sparkCount, sparkLevels, sparkWeek } from '#shared/braille-spark'

/**
 * Seven days of counts as seven columns of dots, today in rose, with the count
 * beside them. The levels come from `shared/braille-spark.ts`, so the weekly
 * email and any plain-text surface print the same spark as braille text.
 *
 * A day with no count draws one faint dot, as a track. Plain text leaves that
 * day blank, and on the page a week with one post became one bar floating in
 * a gap, with nothing to say it was a week.
 */
const {
  counts,
  total,
  unit = SPARK_MENTIONS,
  period,
  showUnit = true,
  showTotal = true,
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
  /**
   * Show the count beside the bars. Hide it only where something beside the
   * spark already counts, such as the poster faces on a trending row. The
   * screen reader label keeps the count either way.
   */
  showTotal?: boolean
}>()

const week = computed(() => sparkWeek(counts))
const levels = computed(() => sparkLevels(counts))
const shown = computed(() => total ?? week.value.reduce((sum, count) => sum + count, 0))
const counted = computed(() => [sparkCount(shown.value, unit), period].filter(Boolean).join(' '))
const totalText = computed(() => showUnit ? counted.value : shown.value.toLocaleString('en-US'))
const label = computed(() => `${counted.value}. Per day, oldest first: ${week.value.join(', ')}. Today: ${week.value.at(-1)}.`)
</script>

<template>
  <span class="braille-spark" role="img" :aria-label="label">
    <SparkDots :levels />
    <span v-if="showTotal" class="braille-spark__total" aria-hidden="true">{{ totalText }}</span>
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
</style>
