<script setup lang="ts">
import type { OgFace } from '../utils/og-style'
import { computed } from 'vue'
import { OG_MUTED, ogEvenLines, ogLineStyle, ogTitleStyle } from '../utils/og-style'

// Centred OG text of up to `lines` lines, broken evenly when it needs two.
const { text, size, face = 'body', lines = 2, color = OG_MUTED } = defineProps<{
  text: string
  size: number
  face?: OgFace
  lines?: number
  color?: string
}>()

const rows = computed(() => ogEvenLines(text, { fontSize: size, face, lines }))
const style = computed(() => face === 'title' ? ogTitleStyle(size, lines) : ogLineStyle(size, lines, color))
</script>

<template>
  <div class="flex flex-col items-center">
    <div v-for="(row, index) in rows" :key="index" :style="style">
      {{ row }}
    </div>
  </div>
</template>
