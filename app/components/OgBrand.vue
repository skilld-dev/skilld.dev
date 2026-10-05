<script setup lang="ts">
import { BRAND_DARK, lockupGeometry, lockupSvg, svgDataUri } from '#shared/brand-mark'

// `size` is the wordmark's font size in px. OG cards are dark, so the lockup takes the dark colours.
const { size = 32 } = defineProps<{
  size?: number
}>()

const { box } = lockupGeometry()
const src = svgDataUri(lockupSvg({ colors: BRAND_DARK }))
</script>

<template>
  <img
    :src="src"
    alt="skilld"
    :width="Math.round(box.width * size) / 100"
    :height="Math.round(box.height * size) / 100"
  >
</template>
