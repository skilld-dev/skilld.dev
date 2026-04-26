<script setup lang="ts">
const { compact = false } = defineProps<{
  /** Whether to render icon-only (compact) or icon + label */
  compact?: boolean
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 font-mono text-xs text-muted"
    title="Verifiable provenance available — view receipts on the skill page"
  >
    <UIcon
      name="i-lucide-shield-check"
      class="shrink-0"
      :class="compact ? 'size-3.5' : 'size-4'"
      aria-hidden="true"
    />
    <span v-if="!compact">Receipts</span>
  </span>
</template>
