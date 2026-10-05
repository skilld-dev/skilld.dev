<script setup lang="ts">
import { SPARK_BARS } from '#shared/braille-spark'

/**
 * A rising braille spark that marks "trending" beside a label.
 *
 * The bars are fixed: the mark says "trending", not how much. The newest bar is
 * rose, as on every braille spark. Decorative, so the label beside it carries
 * the meaning for a screen reader.
 */
const bars = SPARK_BARS.slice(1)
</script>

<template>
  <span class="trending-mark" aria-hidden="true">{{ bars.slice(0, -1).join('') }}<span class="trending-mark__today">{{ bars.at(-1) }}</span></span>
</template>

<style scoped>
/* IBM Plex Mono has no braille, so the bars fall through to a face that does. */
.trending-mark {
  display: inline-block;
  flex: none;
  font-family: 'IBM Plex Mono', 'DejaVu Sans Mono', 'Apple Braille', 'Segoe UI Symbol', ui-monospace, monospace;
  font-size: 0.875rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--ui-text-dimmed);
}

.trending-mark__today {
  color: var(--brand-dot);
}
</style>
