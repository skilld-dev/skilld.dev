<script setup lang="ts">
interface ClusterExample {
  owner: string
  name: string
  repo: string
  displayName: string
  stars: number
}

interface ClusterCard {
  slug: string
  label: string
  icon: string
  userVoice: string
  skillCount: number
  examples: ClusterExample[]
}

const { data, status, error, refresh } = await useFetch<{ items: ClusterCard[] }>('/api/clusters', {
  key: 'home-outcome-clusters-v2',
})
const clusters = computed(() => data.value?.items ?? [])
</script>

<template>
  <div class="outcome-index-shell">
    <div v-if="status === 'pending'" class="outcome-index" aria-busy="true">
      <div v-for="i in 6" :key="i" class="outcome-index__skeleton">
        <div class="flex items-center justify-between gap-4">
          <USkeleton class="h-4 w-7" />
          <USkeleton class="size-4" />
        </div>
        <USkeleton class="mt-5 h-5 w-2/3" />
        <USkeleton class="mt-3 h-4 w-full" />
        <USkeleton class="mt-2 h-4 w-4/5" />
      </div>
    </div>

    <div v-else-if="error" class="editorial-state" role="alert">
      <p class="font-medium">
        Could not load task-based discovery.
      </p>
      <p class="mt-1 text-base text-muted">
        Check your connection and try again, or browse every skill directly.
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <UButton
          label="Try outcomes again"
          color="neutral"
          variant="outline"
          class="min-h-11"
          @click="() => refresh()"
        />
        <UButton
          to="/skills"
          label="Browse all skills"
          color="neutral"
          variant="ghost"
          class="min-h-11"
        />
      </div>
    </div>

    <ul v-else-if="clusters.length" class="outcome-index list-none p-0">
      <li v-for="(cluster, index) in clusters" :key="cluster.slug" class="min-w-0">
        <NuxtLink
          :to="`/skills/${cluster.slug}`"
          class="outcome-index__item group"
        >
          <div class="flex items-center justify-between gap-4">
            <span class="flex items-center gap-3">
              <span class="font-mono text-xs tabular-nums text-muted">
                {{ String(index + 1).padStart(2, '0') }}
              </span>
              <UIcon :name="cluster.icon" class="size-4 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
            </span>
            <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
          </div>
          <h3 class="mt-4 text-lg font-semibold">
            {{ cluster.label }}
          </h3>
          <p class="mt-2 flex-1 text-base leading-relaxed text-muted text-pretty">
            {{ cluster.userVoice }}
          </p>
          <p class="mt-4 font-mono text-xs text-muted">
            {{ cluster.skillCount }} {{ cluster.skillCount === 1 ? 'skill' : 'skills' }}
          </p>
        </NuxtLink>
      </li>
    </ul>

    <div v-else class="editorial-state">
      <p class="font-medium">
        No task groups are available yet.
      </p>
      <p class="mt-1 text-base text-muted">
        You can still browse every indexed skill.
      </p>
      <UButton
        to="/skills"
        label="Browse all skills"
        color="neutral"
        variant="outline"
        class="mt-4 min-h-11"
      />
    </div>
  </div>
</template>
