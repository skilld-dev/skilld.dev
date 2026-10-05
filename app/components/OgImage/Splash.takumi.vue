<script setup lang="ts">
import { BRAND_DARK, lockupGeometry, svgDataUri } from '#shared/brand-mark'
import { brailleNamesField, textureSvg } from '../../utils/og-texture'

const { description } = useSiteConfig()

// The lockup's trailing dot is the field's focal point, so the braille names
// resolve into the wordmark and the card keeps one rose element.
const WIDTH = 1200
const HEIGHT = 600
const SIZE = 100
const LEFT = 88
const TOP = 192
const { box, dot } = lockupGeometry()
const scale = SIZE / 100
const focal = { x: LEFT + (dot.cx - box.x) * scale, y: TOP + (dot.cy - box.y) * scale }
const textTop = TOP + box.height * scale + 40
const texture = svgDataUri(textureSvg(
  brailleNamesField({
    width: WIDTH,
    height: HEIGHT,
    focal,
    clear: [
      { x: LEFT - 28, y: TOP - 28, width: box.width * scale + 56, height: box.height * scale + 56 },
      { x: LEFT - 28, y: textTop - 20, width: 680, height: 190 },
    ],
  }),
  { width: WIDTH, height: HEIGHT, ink: BRAND_DARK.ink, radius: 1.7 },
))
</script>

<template>
  <OgLayout>
    <img :src="texture" alt="" :width="WIDTH" :height="HEIGHT" :style="{ position: 'absolute', top: 0, left: 0 }">
    <div :style="{ position: 'absolute', left: `${LEFT}px`, top: `${TOP}px` }">
      <OgBrand :size="SIZE" />
    </div>
    <div
      class="text-3xl leading-snug"
      :style="{ position: 'absolute', left: `${LEFT}px`, top: `${textTop}px`, width: '620px', color: 'oklch(0.72 0.01 60)' }"
    >
      {{ description }}
    </div>
  </OgLayout>
</template>
