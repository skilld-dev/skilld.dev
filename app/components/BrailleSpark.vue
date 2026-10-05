<script setup lang="ts">
import { brailleSpark, sparkWeek } from '#shared/braille-spark'

/**
 * Seven days of counts as seven braille bars, today in rose, with the count
 * beside them. The bars are text from `shared/braille-spark.ts`, so the weekly
 * email and any plain-text surface print the same spark.
 */
const {
  counts,
  total,
  unit = 'mentions',
  showUnit = true,
} = defineProps<{
  /** Seven daily counts, oldest first, today last. */
  counts: readonly number[]
  /** The count beside the bars. Defaults to the sum of the seven days. */
  total?: number
  /** What is counted, as a plural noun. The screen reader label always names it. */
  unit?: string
  /** Show the unit after the count. Hide it only where a column heading names it. */
  showUnit?: boolean
}>()

const week = computed(() => sparkWeek(counts))
const bars = computed(() => [...brailleSpark(counts)])
const shown = computed(() => total ?? week.value.reduce((sum, count) => sum + count, 0))
const label = computed(() => `${shown.value.toLocaleString('en-US')} ${unit}. Per day, oldest first: ${week.value.join(', ')}. Today: ${week.value.at(-1)}.`)
</script>

<template>
  <span class="braille-spark" role="img" :aria-label="label">
    <span class="braille-spark__bars" aria-hidden="true">{{ bars.slice(0, -1).join('') }}<span class="braille-spark__today">{{ bars.at(-1) }}</span></span>
    <span class="braille-spark__total" aria-hidden="true">{{ shown.toLocaleString('en-US') }}<template v-if="showUnit"> {{ unit }}</template></span>
  </span>
</template>

<style scoped>
.braille-spark {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
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
  letter-spacing: 0.04em;
  color: var(--ui-text-dimmed);
}

.braille-spark__today {
  color: var(--brand-dot);
}
</style>
