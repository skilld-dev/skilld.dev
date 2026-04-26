<script setup lang="ts">
interface Bin {
  label: string
  count: number
}

const props = withDefaults(defineProps<{
  bins: Bin[]
  ariaLabel: string
  scale?: 'linear' | 'sqrt'
}>(), {
  scale: 'linear',
})

const total = computed(() => props.bins.reduce((sum, b) => sum + b.count, 0))
const max = computed(() => Math.max(1, ...props.bins.map(b => b.count)))

function project(count: number) {
  if (props.scale === 'sqrt')
    return Math.sqrt(count) / Math.sqrt(max.value)
  return count / max.value
}

const summary = computed(() => {
  if (!total.value)
    return `No data in ${props.ariaLabel}.`
  const top = [...props.bins].sort((a, b) => b.count - a.count)[0]!
  return `${total.value} total. Highest bin: ${top.label} with ${top.count}.`
})

const hovered = ref<number | null>(null)

const VIEWBOX_W = 320
const VIEWBOX_H = 140
const PAD_X = 8
const PAD_TOP = 14
const PAD_BOTTOM = 22
const innerW = VIEWBOX_W - PAD_X * 2
const innerH = VIEWBOX_H - PAD_TOP - PAD_BOTTOM

const layout = computed(() => {
  const n = props.bins.length || 1
  const slot = innerW / n
  const barW = slot * 0.66
  return props.bins.map((b, i) => {
    const x = PAD_X + slot * i + (slot - barW) / 2
    const h = project(b.count) * innerH
    const y = PAD_TOP + (innerH - h)
    return { x, y, w: barW, h, label: b.label, count: b.count, slot, slotX: PAD_X + slot * i }
  })
})

const baselineY = PAD_TOP + innerH
const COUNT_INSIDE_THRESHOLD = 16
</script>

<template>
  <div>
    <p class="sr-only">
      {{ summary }}
    </p>
    <div
      v-if="!total"
      class="flex h-[140px] items-center justify-center font-mono text-xs text-muted"
    >
      No data yet.
    </div>
    <svg
      v-else
      :viewBox="`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`"
      preserveAspectRatio="none"
      aria-hidden="true"
      class="block w-full h-[180px]"
    >
      <line
        :x1="PAD_X"
        :y1="baselineY"
        :x2="VIEWBOX_W - PAD_X"
        :y2="baselineY"
        class="stroke-default"
        stroke-width="0.5"
      />
      <g
        v-for="(bar, i) in layout"
        :key="bar.label"
        @mouseenter="hovered = i"
        @mouseleave="hovered = null"
      >
        <rect
          :x="bar.slotX"
          :y="PAD_TOP"
          :width="bar.slot"
          :height="innerH"
          fill="transparent"
        />
        <rect
          :x="bar.x"
          :y="bar.y"
          :width="bar.w"
          :height="Math.max(bar.h, 0.5)"
          :class="hovered === i ? 'fill-primary' : 'fill-default-text'"
          class="transition-colors"
        />
        <text
          v-if="bar.h >= COUNT_INSIDE_THRESHOLD"
          :x="bar.x + bar.w / 2"
          :y="bar.y + 7"
          text-anchor="middle"
          class="font-mono fill-bg"
          font-size="6.5"
        >
          {{ bar.count }}
        </text>
        <text
          v-else
          :x="bar.x + bar.w / 2"
          :y="bar.y - 3"
          text-anchor="middle"
          class="font-mono fill-muted-text"
          font-size="6.5"
        >
          {{ bar.count }}
        </text>
        <text
          :x="bar.x + bar.w / 2"
          :y="VIEWBOX_H - 6"
          text-anchor="middle"
          class="font-mono fill-muted-text"
          font-size="7.5"
        >
          {{ bar.label }}
        </text>
      </g>
    </svg>
    <div
      v-if="hovered !== null && total"
      class="mt-2 font-mono text-xs text-muted tabular-nums"
      aria-live="polite"
    >
      {{ layout[hovered]?.label }}: {{ layout[hovered]?.count }}
      <span class="text-muted/70">({{ Math.round((layout[hovered]!.count / total) * 100) }}%)</span>
    </div>
    <div
      v-else-if="total"
      class="mt-2 font-mono text-xs text-muted tabular-nums opacity-0 select-none"
      aria-hidden="true"
    >
      &nbsp;
    </div>
  </div>
</template>

<style scoped>
.fill-default-text {
  fill: var(--ui-text);
}
.fill-muted-text {
  fill: var(--ui-text-muted);
}
.fill-primary {
  fill: var(--ui-primary);
}
.fill-bg {
  fill: var(--ui-bg);
}
.stroke-default {
  stroke: var(--ui-border);
}
</style>
