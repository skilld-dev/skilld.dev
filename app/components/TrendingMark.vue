<script setup lang="ts">
/**
 * A rising column of dots that marks "trending" beside a label.
 *
 * The levels are fixed: the mark says "trending", not how much. The newest
 * column is rose, as on every braille spark, unless the surface already spends
 * its rose elsewhere: the header's rose is the logo dot. Decorative, so the
 * label beside it carries the meaning for a screen reader.
 */
const { accent = true } = defineProps<{
  /** Ink the newest column rose. Off in the header, where the logo dot holds the rose. */
  accent?: boolean
}>()

const LEVELS = [1, 2, 3, 4] as const
</script>

<template>
  <SparkDots class="trending-mark" :levels="LEVELS" :accent />
</template>
