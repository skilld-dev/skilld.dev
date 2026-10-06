<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoRecording } from '~/utils/home-demos'

/**
 * How a demo was recorded, as a card can afford it: the Agent's logo and the
 * model. Screen readers and the tooltip get the sentence.
 */
const { demo } = defineProps<{ demo: HomeDemoItem }>()

const recording = computed(() => demoRecording(demo))
</script>

<template>
  <span class="demo-recording" :title="recording.sentence">
    <UIcon :name="recording.icon" class="demo-recording__icon" aria-hidden="true" />
    <span class="demo-recording__part" aria-hidden="true">{{ recording.model }}</span>
    <span class="sr-only">{{ recording.sentence }}</span>
  </span>
</template>

<style scoped>
.demo-recording {
  display: inline-flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.demo-recording__part {
  white-space: nowrap;
}

.demo-recording__icon {
  flex: none;
  inline-size: 0.875rem;
  block-size: 0.875rem;
}
</style>
