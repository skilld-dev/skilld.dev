<script setup lang="ts">
interface HistoryPoint {
  at: number
  value: number
}

interface Props {
  points: HistoryPoint[]
  label: string
  approximate?: boolean
}

const { points, label, approximate = false } = defineProps<Props>()

const width = 96
const height = 28
const padding = 2
const titleId = useId()
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const plottedPoints = computed(() => {
  if (points.length === 0)
    return []
  const firstAt = points[0]!.at
  const lastAt = points.at(-1)!.at
  const timeRange = Math.max(1, lastAt - firstAt)
  const maxValue = Math.max(1, ...points.map(point => point.value))
  return points.map(point => ({
    x: points.length === 1
      ? width - padding
      : padding + (point.at - firstAt) / timeRange * (width - padding * 2),
    y: height - padding - point.value / maxValue * (height - padding * 2),
  }))
})

const path = computed(() => plottedPoints.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' '),
)
const latestPoint = computed(() => plottedPoints.value.at(-1) ?? null)

const summary = computed(() => {
  const first = points[0]
  const latest = points.at(-1)
  if (!first || !latest)
    return label
  const qualification = approximate ? ' Approximate historical trend; latest total is exact.' : ''
  return `${label} grew from ${first.value.toLocaleString()} on ${dateFormatter.format(first.at * 1000)} to ${latest.value.toLocaleString()} on ${dateFormatter.format(latest.at * 1000)}.${qualification}`
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="h-7 w-20 overflow-visible text-primary sm:w-24"
    role="img"
    :aria-labelledby="titleId"
    preserveAspectRatio="none"
  >
    <title :id="titleId">{{ summary }}</title>
    <path
      v-if="path"
      :d="path"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-if="latestPoint"
      :cx="latestPoint.x"
      :cy="latestPoint.y"
      r="2"
      fill="currentColor"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
