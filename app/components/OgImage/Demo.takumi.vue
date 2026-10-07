<script setup lang="ts">
import { ogCount, ogText } from '../../utils/og-props'
import { OG_INK, OG_MUTED, OG_RULE, OG_SURFACE } from '../../utils/og-style'

// Declared as the wire types the OG image URL can deliver, not as the types the
// template wants. A size arrives as a number or a string.
const props = defineProps<{
  name?: string | number | null
  recording?: string | number | null
  image?: string | number | null
  imageWidth?: string | number | null
  imageHeight?: string | number | null
}>()

// A demo card is a window onto what the Agent made, under a band that names the
// demo and how it was recorded. The picture fills the window's width from its
// top edge, so a page shows its header and a film its frame, and the card's
// bottom edge cuts the rest.
const WIDTH = 1200
const GUTTER = 56
const BAND = 104
const WINDOW_WIDTH = WIDTH - GUTTER * 2
// Room for the title right of the lockup, and the average advance of one
// character, in em, of a title that is mostly a Skill name.
const TITLE_ROOM = 880
const TITLE_EM = 0.5

const safeTitle = computed(() => `What /${ogText(props.name)} made`)
// A Skill name runs to 64 characters, so a long one shrinks to keep one line.
const titleSize = computed(() => Math.max(20, Math.min(30, Math.floor(TITLE_ROOM / (safeTitle.value.length * TITLE_EM)))))
const safeRecording = computed(() => ogText(props.recording))
const safeImage = computed(() => ogText(props.image))
const scaledHeight = computed(() => {
  const naturalWidth = ogCount(props.imageWidth)
  const naturalHeight = ogCount(props.imageHeight)
  return naturalWidth && naturalHeight ? Math.round(naturalHeight * WINDOW_WIDTH / naturalWidth) : 0
})
</script>

<template>
  <div
    data-theme="dark"
    class="flex flex-col w-full h-full relative overflow-hidden font-sans"
    :style="{ background: 'oklch(0.14 0.008 60)', color: OG_INK }"
  >
    <div
      class="flex items-center justify-between shrink-0"
      :style="{ height: `${BAND}px`, paddingLeft: `${GUTTER}px`, paddingRight: `${GUTTER}px` }"
    >
      <OgBrand :size="30" />
      <div class="flex flex-col items-end" :style="{ gap: '6px' }">
        <span :style="{ fontSize: `${titleSize}px`, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }">
          {{ safeTitle }}
        </span>
        <span v-if="safeRecording" class="font-mono" :style="{ fontSize: '18px', color: OG_MUTED }">
          {{ safeRecording }}
        </span>
      </div>
    </div>
    <div
      class="flex overflow-hidden"
      :style="{
        marginLeft: `${GUTTER}px`,
        width: `${WINDOW_WIDTH}px`,
        flexGrow: 1,
        background: OG_SURFACE,
        border: `1px solid ${OG_RULE}`,
        borderBottom: 'none',
        borderTopLeftRadius: '14px',
        borderTopRightRadius: '14px',
      }"
    >
      <img
        v-if="safeImage && scaledHeight"
        :src="safeImage"
        alt=""
        :width="WINDOW_WIDTH"
        :height="scaledHeight"
        :style="{ width: `${WINDOW_WIDTH}px`, height: `${scaledHeight}px`, flexShrink: 0 }"
      >
    </div>
  </div>
</template>
