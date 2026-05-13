<script setup lang="ts">
interface ClusterExample {
  owner: string
  name: string
  repo: string
  displayName: string
  installs: number
}

interface ClusterCard {
  slug: string
  label: string
  icon: string
  userVoice: string
  skillCount: number
  totalInstalls: number
  examples: ClusterExample[]
}

const { data } = await useFetch<{ items: ClusterCard[] }>('/api/clusters')
const clusters = computed(() => data.value?.items ?? [])

function formatInstalls(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000)
    return `${Math.round(n / 1_000)}k`
  return String(n)
}
</script>

<template>
  <ul
    v-if="clusters.length"
    class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
  >
    <li
      v-for="c in clusters"
      :key="c.slug"
    >
      <NuxtLink
        :to="`/skills/${c.slug}`"
        class="block h-full rounded-lg border border-default p-4 transition-colors hover:border-[var(--ui-text-muted)]"
      >
        <div class="flex items-center gap-2">
          <UIcon :name="c.icon" class="size-4 text-muted" />
          <h3 class="font-mono text-sm font-medium">
            {{ c.label }}
          </h3>
        </div>
        <p class="mt-2 text-xs text-muted leading-relaxed">
          {{ c.userVoice }}
        </p>
        <p
          v-if="c.examples.length"
          class="mt-3 font-mono text-xs text-muted line-clamp-2"
        >
          {{ c.examples.slice(0, 3).map(e => `/${e.name}`).join(' · ') }}
        </p>
        <p class="mt-3 font-mono text-xs text-muted">
          {{ c.skillCount }} {{ c.skillCount === 1 ? 'skill' : 'skills' }}
          <span v-if="c.totalInstalls > 0"> · ~{{ formatInstalls(c.totalInstalls) }} installs</span>
        </p>
      </NuxtLink>
    </li>
  </ul>
</template>
