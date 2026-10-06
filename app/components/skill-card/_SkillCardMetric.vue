<script setup lang="ts">
import type { SkillCardMetricView } from '~/types/skill-card'

/** The one metric an entry shows, as a mono data label. */
const { metric, short = false } = defineProps<{
  metric: SkillCardMetricView
  /** `2 mo. ago` without the `Updated` label, for a column whose place already says it. */
  short?: boolean
}>()
</script>

<template>
  <span class="skill-metric" :title="metric.title">
    <template v-if="metric._tag === 'stars'">
      <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />{{ metric.text }}<span class="sr-only"> GitHub {{ metric.count === 1 ? 'star' : 'stars' }}</span>
    </template>
    <template v-else-if="metric._tag === 'likes'">
      <UIcon name="i-lucide-heart" class="size-3" aria-hidden="true" />{{ metric.text }}<span class="sr-only"> {{ metric.count === 1 ? 'like' : 'likes' }}</span>
    </template>
    <template v-else>
      <template v-if="!short">Updated</template>
      <NuxtTime :datetime="metric.date" locale="en" relative numeric="auto" :relative-style="short ? 'short' : 'long'" />
    </template>
  </span>
</template>

<style scoped>
.skill-metric {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--ui-text-muted);
}
</style>
