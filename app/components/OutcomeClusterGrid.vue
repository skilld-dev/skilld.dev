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
  authorCount: number
  authors: string[]
  examples: ClusterExample[]
}

const { data, status, error, refresh } = await useFetch<{ items: ClusterCard[] }>('/api/clusters', {
  key: 'home-outcome-clusters-v3',
})
const clusters = computed(() => data.value?.items ?? [])

function authorSummary(cluster: ClusterCard): string {
  if (!cluster.authorCount)
    return `${cluster.skillCount} skills`
  return `${cluster.skillCount} skills · ${cluster.authorCount} ${cluster.authorCount === 1 ? 'author' : 'authors'}`
}
</script>

<template>
  <div class="outcome-index-shell">
    <div v-if="status === 'pending'" class="outcome-index" aria-busy="true">
      <div v-for="i in 6" :key="i" class="outcome-index__skeleton">
        <USkeleton class="size-4" />
        <USkeleton class="mt-5 h-5 w-2/3" />
        <USkeleton class="mt-3 h-4 w-full" />
        <USkeleton class="mt-4 h-6 w-24" />
      </div>
    </div>

    <div v-else-if="error" class="editorial-state" role="alert">
      <p class="font-medium">
        Could not load the work tracks.
      </p>
      <p class="mt-1 text-base text-muted">
        Check your connection and try again, or browse every skill directly.
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <UButton
          label="Try tracks again"
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
      <li v-for="cluster in clusters" :key="cluster.slug" class="min-w-0">
        <NuxtLink
          :to="`/skills/${cluster.slug}`"
          class="outcome-index__item group"
        >
          <div class="flex items-center justify-between gap-4">
            <UIcon :name="cluster.icon" class="size-4 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
            <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
          </div>
          <h3 class="mt-4 text-lg font-semibold">
            {{ cluster.label }}
          </h3>
          <p class="mt-2 flex-1 text-base leading-relaxed text-muted text-pretty">
            {{ cluster.userVoice }}
          </p>
          <div class="outcome-index__authors">
            <span v-if="cluster.authors.length" class="outcome-index__avatars" aria-hidden="true">
              <img
                v-for="author in cluster.authors"
                :key="author"
                :src="`https://github.com/${author}.png?size=48`"
                alt=""
                width="24"
                height="24"
                class="outcome-index__avatar"
                loading="lazy"
                decoding="async"
              >
            </span>
            <span class="data-label">{{ authorSummary(cluster) }}</span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <div v-else class="editorial-state">
      <p class="font-medium">
        No work tracks are available yet.
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
