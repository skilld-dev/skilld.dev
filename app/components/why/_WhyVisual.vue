<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { HomeDemoItem } from '~/utils/home-demos'
import type { WhyReasonId } from '~/utils/why-skilld'
import WhyBehaviorsVisual from './_WhyBehaviorsVisual.vue'
import WhyCostVisual from './_WhyCostVisual.vue'
import WhyHumanVisual from './_WhyHumanVisual.vue'
import WhyIndependentVisual from './_WhyIndependentVisual.vue'
import WhyPreviewsVisual from './_WhyPreviewsVisual.vue'
import WhyRunVisual from './_WhyRunVisual.vue'
import WhyTelemetryVisual from './_WhyTelemetryVisual.vue'

/**
 * The picture for one reason. Two of them draw live data the page already
 * has: the head of the trending board and the demos.
 */
const { id, trendingRow = null, demos = [], compact = false } = defineProps<{
  id: WhyReasonId
  trendingRow?: TrendingBoardRow | null
  demos?: readonly HomeDemoItem[]
  /** The fewest parts each picture can show, for a narrow column. */
  compact?: boolean
}>()
</script>

<template>
  <WhyHumanVisual v-if="id === 'human'" :row="trendingRow" />
  <WhyPreviewsVisual v-else-if="id === 'previews'" :demos />
  <WhyIndependentVisual v-else-if="id === 'independent'" :compact />
  <WhyRunVisual v-else-if="id === 'run'" />
  <WhyBehaviorsVisual v-else-if="id === 'behaviors'" />
  <WhyCostVisual v-else-if="id === 'cost'" />
  <WhyTelemetryVisual v-else />
</template>
