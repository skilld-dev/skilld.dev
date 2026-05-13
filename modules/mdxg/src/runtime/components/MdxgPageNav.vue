<script setup lang="ts">
import type { MdxgDocument } from '../types'

defineProps<{
  doc: MdxgDocument
  activeIndex: number
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()
</script>

<template>
  <nav class="mdxg-page-nav" aria-label="Pages">
    <ol>
      <li
        v-for="entry in doc.nav"
        :key="entry.slug"
        class="mdxg-page-nav-item" :class="[`level-${entry.level}`, { active: entry.index === activeIndex }]"
      >
        <button type="button" @click="emit('navigate', entry.index)">
          {{ entry.title }}
        </button>
      </li>
    </ol>
  </nav>
</template>
