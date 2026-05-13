<script setup lang="ts">
import type { MdxgPage } from '../types'
import { computed } from 'vue'
import { useMdxgScrollSpy } from '../composables/useMdxgScrollSpy'

const props = defineProps<{ page: MdxgPage }>()

const ids = computed(() => props.page.outline.map(e => e.id))
const activeId = useMdxgScrollSpy(ids)
</script>

<template>
  <nav v-if="page.outline.length" class="mdxg-outline" aria-label="On this page">
    <ul>
      <li
        v-for="entry in page.outline"
        :key="entry.id"
        class="mdxg-outline-item" :class="[`depth-${entry.depth}`, { active: entry.id === activeId }]"
        :style="{ paddingLeft: `${entry.indent * 0.75}rem` }"
      >
        <a :href="`#${entry.id}`" :aria-current="entry.id === activeId ? 'true' : undefined">{{ entry.text }}</a>
      </li>
    </ul>
  </nav>
</template>
