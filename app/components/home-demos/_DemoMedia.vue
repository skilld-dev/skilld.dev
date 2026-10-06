<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import DemoPicture from './_DemoPicture.vue'
import DemoVideo from './_DemoVideo.vue'

/** What the Agent made: the film when the demo has one, else the shot that fits the screen. */
const { demo, eager = false } = defineProps<{
  demo: HomeDemoItem
  eager?: boolean
}>()
</script>

<template>
  <DemoVideo v-if="demo.video" :demo :video="demo.video" :eager />
  <DemoPicture v-else :demo :eager />
</template>
