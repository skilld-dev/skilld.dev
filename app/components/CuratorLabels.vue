<script setup lang="ts">
import type { CuratorLabel } from '../../server/utils/atproto/curator-index'

const { labels } = defineProps<{
  labels: CuratorLabel[]
}>()

const labelConfig: Record<CuratorLabel, { label: string, icon: string }> = {
  'early-curator': { label: 'Early curator', icon: 'i-lucide-sparkles' },
  'prolific': { label: 'Prolific', icon: 'i-lucide-layers' },
  'verified-maintainer': { label: 'Verified maintainer', icon: 'i-lucide-badge-check' },
}
</script>

<template>
  <div
    v-if="labels.length"
    class="flex flex-wrap gap-1.5"
  >
    <UBadge
      v-for="l in labels"
      :key="l"
      :label="labelConfig[l].label"
      :icon="labelConfig[l].icon"
      variant="subtle"
      color="primary"
      size="xs"
    />
  </div>
</template>
