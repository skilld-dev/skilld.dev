<script setup lang="ts">
import { BRAND_DARK, BRAND_LIGHT, lockupGeometry } from '#shared/brand-mark'

// The wordmark's font size in px. The lockup box is 0.84em tall.
const FONT_SIZE = 18
const { box, caret, glyphs, dot } = lockupGeometry()
const colors = {
  '--logo-ink': BRAND_LIGHT.ink,
  '--logo-dot': BRAND_LIGHT.dot,
  '--logo-ink-dark': BRAND_DARK.ink,
  '--logo-dot-dark': BRAND_DARK.dot,
}
</script>

<template>
  <svg
    class="app-logo"
    :viewBox="`${box.x} ${box.y} ${box.width} ${box.height}`"
    :width="Math.round(box.width * FONT_SIZE) / 100"
    :height="Math.round(box.height * FONT_SIZE) / 100"
    :style="colors"
    role="img"
    aria-label="skilld"
  >
    <g class="app-logo__ink">
      <path :d="caret.d" :transform="caret.transform" />
      <path v-for="(glyph, index) in glyphs" :key="index" :d="glyph.d" :transform="glyph.transform" />
    </g>
    <circle class="app-logo__dot" :cx="dot.cx" :cy="dot.cy" :r="dot.r" />
  </svg>
</template>

<style>
.app-logo {
  display: block;
  flex: none;
}
.app-logo__ink {
  fill: var(--logo-ink);
}
.app-logo__dot {
  fill: var(--logo-dot);
}
.dark .app-logo__ink {
  fill: var(--logo-ink-dark);
}
.dark .app-logo__dot {
  fill: var(--logo-dot-dark);
}
/* The dot is a cursor: it blinks once when the logo's link is hovered. */
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  a:hover > .app-logo .app-logo__dot,
  .app-logo:hover .app-logo__dot {
    animation: app-logo-blink 900ms step-end 1;
  }
}
@keyframes app-logo-blink {
  25% {
    opacity: 0;
  }
  75% {
    opacity: 1;
  }
}
</style>
