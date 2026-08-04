<script setup lang="ts">
interface Row {
  owner: string
  stars: number
  skills: number
}

const props = defineProps<{
  rows: Row[]
  ariaLabel: string
}>()

function safeLog(n: number) {
  return Math.log10(Math.max(0, n) + 1)
}

const max = computed(() => Math.max(1, ...props.rows.map(r => safeLog(r.stars))))

const summary = computed(() => {
  if (!props.rows.length)
    return `No data in ${props.ariaLabel}.`
  return `Top ${props.rows.length} owners ranked by their highest-starred repo.`
})
</script>

<template>
  <div>
    <p class="sr-only">
      {{ summary }}
    </p>
    <div
      v-if="!rows.length"
      class="flex h-[200px] items-center justify-center font-mono text-xs text-muted"
    >
      No data yet.
    </div>
    <ol
      v-else
      class="space-y-1.5"
      :aria-label="ariaLabel"
    >
      <li
        v-for="(row, i) in rows"
        :key="row.owner"
        class="group grid grid-cols-[2.5rem_minmax(7rem,_10rem)_1fr_auto] items-center gap-3 rounded px-1 py-1 hover:bg-muted/40"
      >
        <span class="font-mono text-xs text-muted tabular-nums">
          {{ String(i + 1).padStart(2, '0') }}
        </span>
        <NuxtLink
          :to="ownerHubPath(row.owner)"
          class="font-mono text-sm text-default hover:text-primary truncate"
        >
          {{ row.owner }}
        </NuxtLink>
        <div class="relative h-2 rounded-sm bg-muted/40">
          <div
            class="absolute inset-y-0 left-0 rounded-sm bg-default transition-colors group-hover:bg-primary"
            :style="{ width: `${(safeLog(row.stars) / max) * 100}%` }"
          />
        </div>
        <span
          class="font-mono text-xs text-default tabular-nums whitespace-nowrap"
          :title="`${row.stars.toLocaleString()} GitHub stars`"
        >
          {{ formatGithubStars(row.stars) }}
          <span class="text-muted">★ · {{ row.skills }} sk</span>
        </span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.bg-default {
  background-color: var(--ui-text);
}
.group:hover .group-hover\:bg-primary {
  background-color: var(--ui-primary);
}
</style>
