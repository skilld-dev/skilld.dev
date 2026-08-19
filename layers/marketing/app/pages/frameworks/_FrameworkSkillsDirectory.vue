<script setup lang="ts">
import type { TagProfile } from '#layers/registry/server/api/tags/[slug].get'

type FrameworkDirectoryView
  = | { _tag: 'loading' }
    | { _tag: 'error' }
    | { _tag: 'empty' }
    | { _tag: 'ready', data: TagProfile }

const {
  data,
  status,
  error,
  framework,
  title,
  description,
  headingId,
  icon,
  websiteUrl,
  websiteLabel,
  syncedAgo,
} = defineProps<{
  data?: TagProfile | null
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: unknown
  framework: string
  title: string
  description: string
  headingId: string
  icon: string
  websiteUrl: string
  websiteLabel: string
  syncedAgo: string
}>()

const emit = defineEmits<{
  refresh: []
}>()

const pageSize = 24
const visibleSkillCount = ref(pageSize)

const view = computed<FrameworkDirectoryView>(() => {
  if (status === 'pending' && !data)
    return { _tag: 'loading' }
  if (error)
    return { _tag: 'error' }
  if (!data)
    return { _tag: 'empty' }
  return { _tag: 'ready', data }
})

const visibleSkills = computed(() =>
  view.value._tag === 'ready'
    ? view.value.data.skills.slice(0, visibleSkillCount.value)
    : [],
)
const creatorCount = computed(() =>
  view.value._tag === 'ready'
    ? new Set(view.value.data.skills.map(skill => skill.owner)).size
    : 0,
)
const hasMore = computed(() =>
  view.value._tag === 'ready'
  && visibleSkillCount.value < view.value.data.skills.length,
)

watch(() => data?.tag.slug, () => {
  visibleSkillCount.value = pageSize
})

function showMore() {
  visibleSkillCount.value += pageSize
}
</script>

<template>
  <div>
    <CompactPageHeader
      :title
      :description
      :heading-id="headingId"
    >
      <template #aside>
        <div v-if="view._tag === 'ready'" class="flex flex-wrap gap-x-6 gap-y-3 md:justify-end">
          <div>
            <p class="data-label">
              Skills
            </p>
            <p class="mt-1 font-mono text-sm tabular-nums">
              {{ view.data.totalSkills }}
            </p>
          </div>
          <div>
            <p class="data-label">
              Creators
            </p>
            <p class="mt-1 font-mono text-sm tabular-nums">
              {{ creatorCount }}
            </p>
          </div>
          <div v-if="view.data.totalStars > 0">
            <p class="data-label">
              Stars
            </p>
            <p
              class="mt-1 inline-flex items-center gap-1 font-mono text-sm tabular-nums"
              :title="`${view.data.totalStars.toLocaleString()} GitHub stars combined`"
            >
              <UIcon name="i-lucide-star" class="size-3.5" aria-hidden="true" />
              {{ formatGithubStars(view.data.totalStars) }}
            </p>
          </div>
        </div>
      </template>

      <div class="flex flex-wrap gap-3">
        <UButton
          :to="websiteUrl"
          target="_blank"
          rel="noopener"
          :icon
          :label="websiteLabel"
          color="neutral"
          variant="outline"
          class="min-h-11"
          :aria-label="`${framework} official site, opens in a new tab`"
        />
        <UButton
          to="/skills"
          icon="i-lucide-arrow-left"
          label="All skills"
          color="neutral"
          variant="ghost"
          class="min-h-11"
        />
      </div>
    </CompactPageHeader>

    <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-12">
      <div
        v-if="view._tag === 'loading'"
        class="space-y-6"
        aria-busy="true"
        aria-label="Loading framework skills"
      >
        <USkeleton class="h-4 w-32" />
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <USkeleton v-for="index in 6" :key="index" class="h-36 rounded-lg" />
        </div>
      </div>

      <div v-else-if="view._tag === 'error'" class="editorial-state" role="alert">
        <UIcon name="i-lucide-cloud-off" class="size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 font-medium">
          Could not load {{ framework }} skills.
        </p>
        <p class="mt-1 text-base text-muted">
          Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
          @click="emit('refresh')"
        />
      </div>

      <div v-else-if="view._tag === 'empty'" class="editorial-state" role="status">
        <UIcon name="i-lucide-package-x" class="size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 font-medium">
          No {{ framework }} skills indexed yet.
        </p>
        <p class="mt-1 text-base text-muted">
          Browse the full registry to find what you need.
        </p>
        <UButton
          to="/skills"
          label="Browse all skills"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
        />
      </div>

      <template v-else>
        <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold">
              {{ framework }} skills
            </h2>
          </div>
          <p class="data-label" aria-live="polite">
            Showing {{ visibleSkills.length }} of {{ view.data.totalSkills }}
          </p>
        </div>

        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0">
          <li v-for="skill in visibleSkills" :key="skill.slug">
            <SkillCard :skill show-owner-path />
          </li>
        </ul>

        <div v-if="hasMore" class="mt-8 flex justify-center">
          <UButton
            label="Show 24 more"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-chevron-down"
            class="min-h-11"
            @click="showMore"
          />
        </div>

        <section
          v-if="view.data.relatedTags.length"
          class="mt-12 border-t border-default pt-8"
          aria-labelledby="related-heading"
        >
          <h2 id="related-heading" class="section-label mb-3">
            Often appears with
          </h2>
          <ul class="flex flex-wrap items-center gap-2 list-none p-0">
            <li v-for="tag in view.data.relatedTags" :key="tag.slug">
              <UBadge variant="subtle" color="neutral" size="sm" class="font-mono">
                {{ tag.label }}
                <span class="ml-1.5 opacity-60">{{ tag.count }}</span>
              </UBadge>
            </li>
          </ul>
        </section>

        <p class="mt-8 text-xs text-muted">
          Synced {{ syncedAgo }}
        </p>
      </template>
    </div>
  </div>
</template>
