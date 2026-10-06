<script setup lang="ts">
import { BRAND_DARK, lockupGeometry, svgDataUri } from '#shared/brand-mark'
import { OG_COLUMN_WIDTH } from '../utils/og-style'
import { brailleNamesField, textureSvg } from '../utils/og-texture'

// Every OG card is the homepage hero as one still frame: the lockup centred at
// the top, the card's content centred under it, and the braille names field
// in the margins. The field resolves toward the lockup's dot, which stays the
// card's one rose element.
const WIDTH = 1200
const HEIGHT = 600
const LOCKUP_SIZE = 34
const LOCKUP_TOP = 64
const COLUMN_LEFT = (WIDTH - OG_COLUMN_WIDTH) / 2
// The field stops 30px short of the column, so no braille letter touches text.
const CLEAR = { x: COLUMN_LEFT - 30, y: 0, width: OG_COLUMN_WIDTH + 60, height: HEIGHT }

const { box, dot } = lockupGeometry()
const lockupWidth = (box.width * LOCKUP_SIZE) / 100
const lockupHeight = (box.height * LOCKUP_SIZE) / 100
const lockupLeft = (WIDTH - lockupWidth) / 2
const focal = {
  x: lockupLeft + ((dot.cx - box.x) * LOCKUP_SIZE) / 100,
  y: LOCKUP_TOP + ((dot.cy - box.y) * LOCKUP_SIZE) / 100,
}
const texture = svgDataUri(textureSvg(
  brailleNamesField({ width: WIDTH, height: HEIGHT, focal, clear: [CLEAR] }),
  { width: WIDTH, height: HEIGHT, ink: BRAND_DARK.ink, radius: 1.7 },
))
</script>

<template>
  <div
    data-theme="dark"
    class="flex w-full h-full relative overflow-hidden font-sans"
    :style="{
      background: 'oklch(0.14 0.008 60)',
      color: 'oklch(0.93 0.008 60)',
    }"
  >
    <img :src="texture" alt="" :width="WIDTH" :height="HEIGHT" :style="{ position: 'absolute', top: 0, left: 0 }">
    <div
      :style="{
        position: 'absolute',
        left: `${lockupLeft}px`,
        top: `${LOCKUP_TOP}px`,
        width: `${lockupWidth}px`,
        height: `${lockupHeight}px`,
      }"
    >
      <OgBrand :size="LOCKUP_SIZE" />
    </div>
    <div
      class="flex flex-col items-center justify-center w-full h-full text-center"
      :style="{ paddingTop: '70px', paddingLeft: `${COLUMN_LEFT}px`, paddingRight: `${COLUMN_LEFT}px` }"
    >
      <slot />
    </div>
  </div>
</template>
