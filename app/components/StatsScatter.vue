<script setup lang="ts">
interface Point {
  name: string
  owner: string
  stars: number
  installs: number
}

const props = defineProps<{
  points: Point[]
  ariaLabel: string
}>()

const VIEWBOX_W = 320
const VIEWBOX_H = 240
const PAD_L = 32
const PAD_R = 8
const PAD_T = 8
const PAD_B = 30
const innerW = VIEWBOX_W - PAD_L - PAD_R
const innerH = VIEWBOX_H - PAD_T - PAD_B

function safeLog(n: number) {
  return Math.log10(Math.max(0, n) + 1)
}

const dimensions = computed(() => {
  const xs = props.points.map(p => safeLog(p.stars))
  const ys = props.points.map(p => safeLog(p.installs))
  const xMax = Math.max(1, ...xs)
  const yMax = Math.max(1, ...ys)
  return { xMax, yMax }
})

const layoutPoints = computed(() => {
  return props.points.map((p, i) => {
    const xLog = safeLog(p.stars)
    const yLog = safeLog(p.installs)
    const x = PAD_L + (xLog / dimensions.value.xMax) * innerW
    const y = PAD_T + innerH - (yLog / dimensions.value.yMax) * innerH
    return { ...p, x, y, i }
  })
})

const xTicks = computed(() => {
  const ticks: { x: number, label: string }[] = []
  for (let exp = 0; exp <= Math.ceil(dimensions.value.xMax); exp++) {
    const x = PAD_L + (exp / dimensions.value.xMax) * innerW
    ticks.push({ x, label: exp === 0 ? '0' : `1e${exp}` })
  }
  return ticks
})

const yTicks = computed(() => {
  const ticks: { y: number, label: string }[] = []
  for (let exp = 0; exp <= Math.ceil(dimensions.value.yMax); exp++) {
    const y = PAD_T + innerH - (exp / dimensions.value.yMax) * innerH
    ticks.push({ y, label: exp === 0 ? '0' : `1e${exp}` })
  }
  return ticks
})

const hovered = ref<number | null>(null)
const hoveredPoint = computed(() => hovered.value !== null ? layoutPoints.value[hovered.value] : null)

const summary = computed(() => {
  if (!props.points.length)
    return `No data in ${props.ariaLabel}.`
  return `${props.points.length} skills plotted by stars (x, log scale) versus installs (y, log scale).`
})
</script>

<template>
  <div>
    <p class="sr-only">
      {{ summary }}
    </p>
    <div
      v-if="!points.length"
      class="flex h-[240px] items-center justify-center font-mono text-xs text-muted"
    >
      No data yet.
    </div>
    <div
      v-else
      class="relative"
    >
      <svg
        :viewBox="`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`"
        preserveAspectRatio="none"
        aria-hidden="true"
        class="block w-full h-[240px]"
      >
        <line
          v-for="t in xTicks"
          :key="`x-${t.label}`"
          :x1="t.x"
          :y1="PAD_T"
          :x2="t.x"
          :y2="PAD_T + innerH"
          class="stroke-grid"
          stroke-width="0.3"
        />
        <line
          v-for="t in yTicks"
          :key="`y-${t.label}`"
          :x1="PAD_L"
          :y1="t.y"
          :x2="PAD_L + innerW"
          :y2="t.y"
          class="stroke-grid"
          stroke-width="0.3"
        />

        <line
          :x1="PAD_L"
          :y1="PAD_T + innerH"
          :x2="PAD_L + innerW"
          :y2="PAD_T + innerH"
          class="stroke-default"
          stroke-width="0.5"
        />
        <line
          :x1="PAD_L"
          :y1="PAD_T"
          :x2="PAD_L"
          :y2="PAD_T + innerH"
          class="stroke-default"
          stroke-width="0.5"
        />

        <text
          v-for="t in xTicks"
          :key="`xl-${t.label}`"
          :x="t.x"
          :y="VIEWBOX_H - 12"
          text-anchor="middle"
          class="font-mono fill-muted-text"
          font-size="7.5"
        >
          {{ t.label }}
        </text>
        <text
          v-for="t in yTicks"
          :key="`yl-${t.label}`"
          :x="PAD_L - 4"
          :y="t.y + 2"
          text-anchor="end"
          class="font-mono fill-muted-text"
          font-size="7.5"
        >
          {{ t.label }}
        </text>
        <text
          :x="PAD_L + innerW / 2"
          :y="VIEWBOX_H - 3"
          text-anchor="middle"
          class="font-mono fill-muted-text"
          font-size="7.5"
        >
          stars (log)
        </text>
        <text
          :x="8"
          :y="PAD_T + innerH / 2"
          text-anchor="middle"
          class="font-mono fill-muted-text"
          font-size="7.5"
          :transform="`rotate(-90 8 ${PAD_T + innerH / 2})`"
        >
          installs (log)
        </text>

        <circle
          v-for="p in layoutPoints"
          :key="`${p.owner}/${p.name}`"
          :cx="p.x"
          :cy="p.y"
          :r="hovered === p.i ? 3 : 1.6"
          :class="hovered === p.i ? 'fill-primary' : 'fill-default-text'"
          fill-opacity="0.55"
          @mouseenter="hovered = p.i"
          @mouseleave="hovered = null"
        />
      </svg>
      <div
        class="mt-2 min-h-[1.25rem] font-mono text-xs text-muted tabular-nums"
        aria-live="polite"
      >
        <template v-if="hoveredPoint">
          <span class="text-default">{{ hoveredPoint.owner }}/{{ hoveredPoint.name }}</span>
          <span> · {{ hoveredPoint.stars.toLocaleString() }} stars · {{ hoveredPoint.installs.toLocaleString() }} installs</span>
        </template>
      </div>
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
.stroke-default {
  stroke: var(--ui-border);
}
.stroke-grid {
  stroke: var(--ui-border);
  opacity: 0.4;
}
</style>
