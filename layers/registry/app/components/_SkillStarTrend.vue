<script setup lang="ts">
interface HistoryPoint {
  /** Unix seconds. */
  at: number
  value: number
}

const { points, approximate = false } = defineProps<{
  points: HistoryPoint[]
  approximate?: boolean
}>()

const DAY = 86_400
const RANGES = { week: 7, month: 30 } as const
const range = ref<keyof typeof RANGES>('month')
const hovered = ref<number | null>(null)

const width = 224
const height = 44
const padding = 2
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

const visible = computed(() => {
  const lastAt = points.at(-1)?.at ?? 0
  const inRange = points.filter(point => point.at >= lastAt - RANGES[range.value] * DAY)
  return inRange.length >= 2 ? inRange : points.slice(-2)
})

// Stars never start from zero in the tracked window, so the line scales to the
// window's own range. A zero baseline would draw a flat line at the top.
const plotted = computed(() => {
  const list = visible.value
  if (list.length < 2)
    return []
  const firstAt = list[0]!.at
  const timeRange = Math.max(1, list.at(-1)!.at - firstAt)
  const min = Math.min(...list.map(point => point.value))
  const valueRange = Math.max(1, Math.max(...list.map(point => point.value)) - min)
  return list.map(point => ({
    x: padding + (point.at - firstAt) / timeRange * (width - padding * 2),
    y: height - padding - (point.value - min) / valueRange * (height - padding * 2),
  }))
})

const line = computed(() => plotted.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' '))
const area = computed(() => line.value
  ? `${line.value} L${width - padding} ${height} L${padding} ${height} Z`
  : '')

const focusIndex = computed(() => hovered.value ?? visible.value.length - 1)
const focusPoint = computed(() => visible.value[focusIndex.value] ?? null)
const focusPlot = computed(() => plotted.value[focusIndex.value] ?? null)
const gained = computed(() => (visible.value.at(-1)?.value ?? 0) - (visible.value[0]?.value ?? 0))
const gainedLabel = computed(() => `${gained.value >= 0 ? '+' : '−'}${Math.abs(gained.value).toLocaleString()}`)

function onPointerMove(event: PointerEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width * width
  let nearest = 0
  plotted.value.forEach((point, index) => {
    if (Math.abs(point.x - x) < Math.abs(plotted.value[nearest]!.x - x))
      nearest = index
  })
  hovered.value = nearest
}

const summary = computed(() => {
  const first = visible.value[0]
  const last = visible.value.at(-1)
  if (!first || !last)
    return 'Repository stars'
  const qualification = approximate ? ' Approximate trend; the latest total is exact.' : ''
  // A short history falls back to its last two points, so name the real dates.
  return `Repository stars went from ${first.value.toLocaleString()} on ${dateFormatter.format(first.at * 1000)} to ${last.value.toLocaleString()} on ${dateFormatter.format(last.at * 1000)}.${qualification}`
})
</script>

<template>
  <div class="flex w-60 flex-col gap-1">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="h-11 w-full touch-none overflow-visible text-primary"
      role="img"
      :aria-label="summary"
      preserveAspectRatio="none"
      @pointermove="onPointerMove"
      @pointerleave="hovered = null"
    >
      <path
        v-if="area"
        :d="area"
        fill="currentColor"
        fill-opacity="0.12"
      />
      <path
        v-if="line"
        :d="line"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
      <line
        v-if="hovered !== null && focusPlot"
        :x1="focusPlot.x"
        :x2="focusPlot.x"
        y1="0"
        :y2="height"
        stroke="currentColor"
        stroke-opacity="0.35"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <div class="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
      <span
        v-if="focusPoint"
        class="whitespace-nowrap text-default"
      >
        {{ focusPoint.value.toLocaleString() }}
        <span class="text-muted">{{ hovered === null ? `stars ${gainedLabel}` : `stars ${dateFormatter.format(focusPoint.at * 1000)}` }}</span>
      </span>
      <span
        class="flex shrink-0 gap-1"
        role="group"
        aria-label="Star trend range"
      >
        <button
          v-for="(_, key) in RANGES"
          :key="key"
          type="button"
          class="min-h-6 px-1 transition-colors"
          :class="range === key ? 'text-default' : 'text-muted hover:text-default'"
          :aria-pressed="range === key"
          @click="range = key"
        >
          {{ key }}
        </button>
      </span>
    </div>
  </div>
</template>
