<script setup lang="ts">
import type { MdxgDocument } from '../types'
import { computed } from 'vue'

const props = defineProps<{
  doc: MdxgDocument
  activeIndex: number
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()

const prev = computed(() => props.doc.pages[props.activeIndex - 1])
const next = computed(() => props.doc.pages[props.activeIndex + 1])
</script>

<template>
  <nav class="mdxg-seq-nav" aria-label="Sequential">
    <button
      type="button"
      class="mdxg-seq-prev"
      :disabled="!prev"
      @click="prev && emit('navigate', prev.index)"
    >
      <span class="mdxg-seq-dir">‹ Previous</span>
      <span v-if="prev" class="mdxg-seq-title">{{ prev.title }}</span>
    </button>
    <button
      type="button"
      class="mdxg-seq-next"
      :disabled="!next"
      @click="next && emit('navigate', next.index)"
    >
      <span class="mdxg-seq-dir">Next ›</span>
      <span v-if="next" class="mdxg-seq-title">{{ next.title }}</span>
    </button>
  </nav>
</template>
