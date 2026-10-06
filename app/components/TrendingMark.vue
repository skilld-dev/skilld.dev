<script setup lang="ts">
import { SPARK_BARS } from '#shared/braille-spark'

/**
 * A rising braille spark that marks "trending" beside a label.
 *
 * The bars are fixed: the mark says "trending", not how much. The newest bar is
 * rose, as on every braille spark, unless the surface already spends its rose
 * elsewhere: the header's rose is the logo dot. Decorative, so the label
 * beside it carries the meaning for a screen reader.
 */
const { accent = true } = defineProps<{
  /** Ink the newest bar rose. Off in the header, where the logo dot holds the rose. */
  accent?: boolean
}>()

const bars = SPARK_BARS.slice(1)
</script>

<template>
  <span class="trending-mark" aria-hidden="true">{{ bars.slice(0, -1).join('') }}<span :class="accent && 'trending-mark__today'">{{ bars.at(-1) }}</span></span>
</template>

<style scoped>
/* IBM Plex Mono has no braille, so the bars fall through to a face that does.
   Muted, not dimmed: `--ui-text-dimmed` is stone 400 in light and stone 500
   in dark, and both fail text contrast on the page surface. Muted is the
   lightest stone token that passes AA in both modes. */
.trending-mark {
  display: inline-block;
  flex: none;
  font-family: 'IBM Plex Mono', 'DejaVu Sans Mono', 'Apple Braille', 'Segoe UI Symbol', ui-monospace, monospace;
  font-size: 0.875rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.trending-mark__today {
  color: var(--brand-dot);
}
</style>
