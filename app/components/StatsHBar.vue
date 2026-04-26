<script setup lang="ts">
interface Bin {
  label: string
  count: number
}

const props = defineProps<{
  bins: Bin[]
  ariaLabel: string
}>()

const total = computed(() => props.bins.reduce((sum, b) => sum + b.count, 0))
const hovered = ref<number | null>(null)

const summary = computed(() => {
  if (!total.value)
    return `No data in ${props.ariaLabel}.`
  const top = [...props.bins].sort((a, b) => b.count - a.count)[0]!
  const pct = Math.round((top.count / total.value) * 100)
  return `${total.value} repos. Largest segment: ${top.label} (${pct}%).`
})

const segments = computed(() => {
  let acc = 0
  return props.bins.map((b, i) => {
    const pct = total.value ? (b.count / total.value) * 100 : 0
    const seg = { ...b, pct, start: acc, index: i }
    acc += pct
    return seg
  })
})
</script>

<template>
  <div>
    <p class="sr-only">
      {{ summary }}
    </p>
    <div
      v-if="!total"
      class="flex h-[60px] items-center justify-center font-mono text-xs text-muted"
    >
      No data yet.
    </div>
    <template v-else>
      <div
        class="relative h-3 w-full overflow-hidden rounded border border-default"
        role="img"
        :aria-label="ariaLabel"
      >
        <div
          v-for="seg in segments"
          :key="seg.label"
          class="absolute top-0 bottom-0 transition-opacity"
          :style="{
            left: `${seg.start}%`,
            width: `${seg.pct}%`,
            backgroundColor: hovered === seg.index ? 'var(--ui-primary)' : 'var(--ui-text)',
            opacity: hovered === null ? 0.4 + 0.6 * (1 - seg.index / Math.max(segments.length - 1, 1)) : (hovered === seg.index ? 1 : 0.18),
            boxShadow: seg.index < segments.length - 1 ? 'inset -1px 0 0 0 var(--ui-bg)' : 'none',
          }"
          @mouseenter="hovered = seg.index"
          @mouseleave="hovered = null"
        />
      </div>
      <ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        <li
          v-for="seg in segments"
          :key="seg.label"
          class="flex items-center gap-2 font-mono text-xs"
          @mouseenter="hovered = seg.index"
          @mouseleave="hovered = null"
        >
          <span
            class="size-2 shrink-0 rounded-sm transition-colors"
            :style="{
              backgroundColor: hovered === seg.index ? 'var(--ui-primary)' : 'var(--ui-text)',
              opacity: 0.4 + 0.6 * (1 - seg.index / Math.max(segments.length - 1, 1)),
            }"
            aria-hidden="true"
          />
          <span class="text-muted">{{ seg.label }}</span>
          <span class="ml-auto text-default tabular-nums">{{ seg.count }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>
