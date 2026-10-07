<script setup lang="ts">
import type { RecentPullRequest } from '#shared/open-source-pull-requests'
import type { TrendingBoardRow } from '#shared/trending-range'
import type { HomeDemoItem } from '~/utils/home-demos'
import type { WhyReasonId } from '~/utils/why-skilld'
import WhyBehaviorsVisual from './_WhyBehaviorsVisual.vue'
import WhyCostVisual from './_WhyCostVisual.vue'
import WhyHumanVisual from './_WhyHumanVisual.vue'
import WhyOpenVisual from './_WhyOpenVisual.vue'
import WhyPreviewsVisual from './_WhyPreviewsVisual.vue'
import WhyRunVisual from './_WhyRunVisual.vue'
import WhyTelemetryVisual from './_WhyTelemetryVisual.vue'
import WhyWeightsVisual from './_WhyWeightsVisual.vue'

/**
 * The picture for one reason. Three draw live data the page fetches: the head
 * of the trending board, the demos, and the recently merged pull requests.
 */
const { id, trendingRow = null, demos = [], pulls = [], compact = false } = defineProps<{
  id: WhyReasonId
  trendingRow?: TrendingBoardRow | null
  demos?: readonly HomeDemoItem[]
  pulls?: readonly RecentPullRequest[]
  /** The fewest parts each picture can show, for a narrow column. */
  compact?: boolean
}>()
</script>

<template>
  <WhyHumanVisual v-if="id === 'human'" :row="trendingRow" />
  <WhyPreviewsVisual v-else-if="id === 'previews'" :demos />
  <WhyOpenVisual v-else-if="id === 'open'" :pulls :compact />
  <WhyWeightsVisual v-else-if="id === 'weights'" :compact />
  <WhyRunVisual v-else-if="id === 'run'" />
  <WhyBehaviorsVisual v-else-if="id === 'behaviors'" />
  <WhyCostVisual v-else-if="id === 'cost'" />
  <WhyTelemetryVisual v-else />
</template>
