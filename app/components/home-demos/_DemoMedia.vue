<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import DemoPicture from './_DemoPicture.vue'
import DemoVideo from './_DemoVideo.vue'

/** What the Agent made: the film when the demo has one, else the shot that fits the screen. */
const { demo, eager = false, play = 'hover' } = defineProps<{
  demo: HomeDemoItem
  eager?: boolean
  /** How a film starts: on hover or focus, or as soon as it is on screen. */
  play?: 'hover' | 'visible'
}>()
</script>

<template>
  <DemoVideo v-if="demo.video" :demo :video="demo.video" :eager :play />
  <DemoPicture v-else :demo :eager />
</template>
