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
  isNew: boolean
  examples: ClusterExample[]
}

const { limit, rows, order } = defineProps<{
  /** Most cards to render. Bounds the list before any row cap applies. */
  limit?: number
  /** Cap the visible grid to this many rows at every breakpoint. */
  rows?: number
  /**
   * Slugs in the order they should appear. The API sorts by how many Skills
   * a track holds, which is supply. Pass demand here to override it. Slugs
   * the list does not name keep their API order, after the ones it does.
   */
  order?: readonly string[]
}>()

const { data, status, error, refresh } = await useFetch<{ items: ClusterCard[] }>('/api/clusters', {
  key: 'home-outcome-clusters-v4',
})
const clusters = computed(() => {
  const items = data.value?.items ?? []
  const ranked = order?.length
    ? [...items].sort((a, b) => rankOf(a.slug) - rankOf(b.slug))
    : items
  return limit ? ranked.slice(0, limit) : ranked
})

/** Unranked slugs sort after every ranked one, in the order the API sent. */
function rankOf(slug: string): number {
  const index = order?.indexOf(slug) ?? -1
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
const rowCapStyle = computed(() =>
  rows ? { gridTemplateRows: `repeat(${rows}, auto)`, gridAutoRows: '0', rowGap: '0' } : undefined,
)
</script>

<template>
  <div class="outcome-index-shell">
    <div v-if="status === 'pending'" class="outcome-index" aria-busy="true">
      <div v-for="i in 8" :key="i" class="outcome-index__skeleton">
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="mt-2 h-4 w-full" />
        <USkeleton class="mt-3 h-5 w-16" />
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

    <ul v-else-if="clusters.length" class="outcome-index list-none p-0" :style="rowCapStyle">
      <li v-for="cluster in clusters" :key="cluster.slug" class="min-w-0">
        <NuxtLink
          :to="`/skills/${cluster.slug}`"
          class="outcome-index__item group"
        >
          <div class="flex items-start gap-2">
            <UIcon :name="cluster.icon" class="mt-0.5 size-4 shrink-0 text-muted transition-colors group-hover:text-default" aria-hidden="true" />
            <h3 class="min-w-0 flex-1 text-base leading-snug font-semibold text-balance">
              {{ cluster.label }}<span v-if="cluster.isNew" class="outcome-index__new">New</span>
            </h3>
            <UIcon name="i-lucide-arrow-up-right" class="mt-0.5 size-3.5 shrink-0 text-dimmed transition-colors group-hover:text-default" aria-hidden="true" />
          </div>
          <p class="mt-1.5 flex-1 text-sm leading-normal text-muted text-pretty">
            {{ cluster.userVoice }}
          </p>
          <span class="outcome-index__foot">
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
            <span class="outcome-index__count">
              {{ cluster.skillCount }} {{ cluster.skillCount === 1 ? 'skill' : 'skills' }}
            </span>
          </span>
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
