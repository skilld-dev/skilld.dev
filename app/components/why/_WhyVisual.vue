<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { HomeDemoItem } from '~/utils/home-demos'
import type { WhyReasonId } from '~/utils/why-skilld'
import WhyAuthorVisual from './_WhyAuthorVisual.vue'
import WhyDemoVisual from './_WhyDemoVisual.vue'
import WhyDevsVisual from './_WhyDevsVisual.vue'
import WhyFilesVisual from './_WhyFilesVisual.vue'
import WhyMakerVisual from './_WhyMakerVisual.vue'
import WhyRunVisual from './_WhyRunVisual.vue'
import WhyTelemetryVisual from './_WhyTelemetryVisual.vue'

/**
 * The picture for one reason. Two of them draw live data the page already
 * has: the head of the trending board and one demo.
 */
const { id, trendingRow = null, demo = null } = defineProps<{
  id: WhyReasonId
  trendingRow?: TrendingBoardRow | null
  demo?: HomeDemoItem | null
}>()
</script>

<template>
  <WhyRunVisual v-if="id === 'run'" />
  <WhyFilesVisual v-else-if="id === 'files'" />
  <WhyDevsVisual v-else-if="id === 'devs'" :row="trendingRow" />
  <WhyAuthorVisual v-else-if="id === 'author'" />
  <WhyDemoVisual v-else-if="id === 'demos'" :demo />
  <WhyTelemetryVisual v-else-if="id === 'telemetry'" />
  <WhyMakerVisual v-else />
</template>
