<script setup lang="ts">
import { computed, useId } from 'vue'

type BadgeTarget = 'repository' | 'skill'
type BadgeTheme = 'light' | 'dark'

const {
  target,
  theme = 'light',
  showLabel = true,
  showLikes = false,
} = defineProps<{
  target: BadgeTarget
  theme?: BadgeTheme
  showLabel?: boolean
  showLikes?: boolean
}>()

const likeCount = '128'
const likeSegmentWidth = 46
const clipId = useId()
const categoryLabel = computed(() => target === 'repository' ? 'Skill repo' : 'Agent skill')
const targetLabel = computed(() => target === 'repository' ? 'Skill repository' : 'Agent skill')
const baseWidth = computed(() => showLabel ? 153 : 81)
const brandX = computed(() => showLabel ? 72 : 0)
const width = computed(() => baseWidth.value + (showLikes ? likeSegmentWidth : 0))
const accessibleLabel = computed(() => showLikes
  ? `${targetLabel.value} on skilld.dev, ${likeCount} likes`
  : `${targetLabel.value} on skilld.dev`)
const palette = computed(() => theme === 'dark'
  ? {
      categoryFill: '#3f3833',
      categoryText: '#ffffff',
      brandFill: '#f5f5f4',
      brandText: '#292524',
      likesFill: '#e7e5e4',
      likesText: '#292524',
    }
  : {
      categoryFill: '#f5f5f4',
      categoryText: '#292524',
      brandFill: '#2f2925',
      brandText: '#ffffff',
      likesFill: '#3f3833',
      likesText: '#ffffff',
    })
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    height="22"
    :viewBox="`0 0 ${width} 22`"
    role="img"
    :aria-label="accessibleLabel"
  >
    <title>{{ accessibleLabel }}</title>
    <clipPath :id="clipId">
      <rect :width="width" height="22" rx="4" />
    </clipPath>
    <g :clip-path="`url(#${clipId})`">
      <rect v-if="showLabel" width="72" height="22" :fill="palette.categoryFill" />
      <rect :x="brandX" width="81" height="22" :fill="palette.brandFill" />
      <rect v-if="showLikes" :x="baseWidth" :width="likeSegmentWidth" height="22" :fill="palette.likesFill" />
    </g>
    <text
      v-if="showLabel"
      x="36"
      y="15"
      :fill="palette.categoryText"
      font-family="Verdana,DejaVu Sans,sans-serif"
      font-size="10"
      text-anchor="middle"
    >{{ categoryLabel }}</text>
    <svg :x="brandX + 8.4" y="6" width="12" height="12" viewBox="0 0 160 160" aria-hidden="true">
      <path
        d="M80 34 L135 104 L121 104 L80 52 L39 104 L25 104 Z"
        fill="#fb7185"
      />
    </svg>
    <text
      :x="brandX + 23.3"
      y="15"
      :fill="palette.brandText"
      font-family="Verdana,DejaVu Sans,sans-serif"
      font-size="10"
      textLength="47.4"
      lengthAdjust="spacingAndGlyphs"
    >skilld.dev</text>
    <template v-if="showLikes">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78a5.5 5.5 0 0 0 0-7.78Z"
        fill="none"
        stroke="#fb7185"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :transform="`translate(${baseWidth + 4} 3.5) scale(.55)`"
      />
      <text
        :x="baseWidth + 21"
        y="15"
        :fill="palette.likesText"
        font-family="Verdana,DejaVu Sans,sans-serif"
        font-size="10"
      >{{ likeCount }}</text>
    </template>
  </svg>
</template>
