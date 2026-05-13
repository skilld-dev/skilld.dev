<script setup lang="ts">
import type { MdxgMode } from '../types'

defineProps<{ modelValue: MdxgMode }>()
defineEmits<{
  'update:modelValue': [mode: MdxgMode]
}>()

const modes: { value: MdxgMode, label: string }[] = [
  { value: 'preview', label: 'Preview' },
  { value: 'source', label: 'Markdown' },
  { value: 'both', label: 'Both' },
]
</script>

<template>
  <div class="mdxg-mode-toggle" role="radiogroup" aria-label="View mode">
    <button
      v-for="m in modes"
      :key="m.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === m.value"
      :class="{ active: modelValue === m.value }"
      @click="$emit('update:modelValue', m.value)"
    >
      {{ m.label }}
    </button>
  </div>
</template>
