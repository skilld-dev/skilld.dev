<script setup lang="ts">
import { BRAND_DARK, svgDataUri } from '#shared/brand-mark'
import { ogText } from '../../utils/og-props'
import { fileMinimap, textureSeed, textureSvg } from '../../utils/og-texture'

// Declared as the wire types the OG image URL can deliver.
const props = defineProps<{
  title?: string | number | null
  description?: string | number | null
}>()

const safeTitle = computed(() => ogText(props.title))
const safeDescription = computed(() => ogText(props.description))

// One SKILL.md, drawn large from its frontmatter down: the file the visitor is about to write.
const texture = svgDataUri(textureSvg(
  fileMinimap({
    region: { x: 880, y: 72, width: 200, height: 456 },
    seed: textureSeed('make-skill'),
    pitch: 9,
    fromStart: true,
  }),
  { width: 1200, height: 600, ink: BRAND_DARK.ink, radius: 2.4 },
))
</script>

<template>
  <OgLayout>
    <img :src="texture" alt="" width="1200" height="600" :style="{ position: 'absolute', top: 0, left: 0 }">
    <div class="px-15 py-14 flex flex-col justify-center gap-10 h-full" :style="{ width: '820px' }">
      <OgBrand :size="36" />

      <div
        class="text-6xl tracking-tighter font-mono leading-none"
        :style="{ lineClamp: 2, textOverflow: 'ellipsis' }"
      >
        {{ safeTitle }}
      </div>

      <div
        v-if="safeDescription"
        class="text-3xl leading-snug"
        :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 3, textOverflow: 'ellipsis' }"
      >
        {{ safeDescription }}
      </div>
    </div>
  </OgLayout>
</template>
