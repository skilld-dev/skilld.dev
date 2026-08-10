<script setup lang="ts">
import type { CommunityDirectoryResponse } from '~~/server/api/community.get'
import CommunityCreator from '../../components/community/_CommunityCreator.vue'

type CommunityFilter = 'all' | 'collections' | 'skills'

const filterOptions: Array<{ label: string, value: CommunityFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Collections', value: 'collections' },
  { label: 'Skills', value: 'skills' },
]

const { data, status, error, refresh } = await useFetch<CommunityDirectoryResponse>('/api/community')
const activeFilter = ref<CommunityFilter>('all')

const filteredCreators = computed(() => (data.value?.items ?? []).filter((creator) => {
  if (activeFilter.value === 'collections')
    return creator.topCollection !== null
  if (activeFilter.value === 'skills')
    return creator.topSkill !== null
  return true
}))

const resultSummary = computed(() => {
  const count = filteredCreators.value.length
  const noun = count === 1 ? 'creator' : 'creators'
  return `${count} ${noun} shown`
})

const title = 'Community'
const description = 'Meet the people publishing agent skills and thoughtful collections on skilld.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})

defineOgImage('Page.takumi', {
  title,
  description,
}, { alt: 'The skilld community directory' })
</script>

<template>
  <div>
    <CompactPageHeader
      title="Community"
      description="People publishing workflow-ready collections and skills from real GitHub repositories. Each person appears once."
      heading-id="community-directory-heading"
    >
      <template #aside>
        <UButton
          to="/collections/new"
          label="Publish a collection"
          icon="i-lucide-plus"
          size="lg"
          class="min-h-11"
        />
      </template>

      <template v-if="data?.items.length" #default>
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          role="search"
          aria-label="Filter community creators"
        >
          <div class="flex flex-wrap gap-2" role="group" aria-label="Filter community creators">
            <UButton
              v-for="option in filterOptions"
              :key="option.value"
              :label="option.label"
              :color="activeFilter === option.value ? 'primary' : 'neutral'"
              :variant="activeFilter === option.value ? 'solid' : 'outline'"
              :aria-pressed="activeFilter === option.value"
              aria-controls="community-creator-list"
              class="min-h-11"
              @click="activeFilter = option.value"
            />
          </div>
          <p class="font-mono text-sm text-muted" aria-live="polite">
            {{ resultSummary }}
          </p>
        </div>
      </template>
    </CompactPageHeader>

    <section
      id="community-directory"
      class="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12"
      aria-labelledby="community-directory-heading"
    >
      <div
        v-if="status === 'pending'"
        class="py-8"
        aria-busy="true"
        aria-label="Loading community creators"
      >
        <div class="editorial-state">
          <USkeleton class="h-4 w-32" />
          <USkeleton class="mt-4 h-9 w-2/3" />
          <USkeleton class="mt-6 h-36 w-full rounded-lg" />
        </div>
      </div>

      <div v-else-if="error" class="py-8">
        <div role="alert" class="editorial-state">
          <p class="text-base font-medium">
            Couldn't load the community.
          </p>
          <p class="mt-2 text-base leading-relaxed text-muted">
            Check your connection and try the directory again.
          </p>
          <UButton
            label="Retry community"
            color="neutral"
            variant="outline"
            class="mt-5 min-h-11"
            @click="() => refresh()"
          />
        </div>
      </div>

      <div v-else-if="!data?.items.length" class="py-8">
        <div role="status" class="editorial-state">
          <p class="text-base font-medium">
            No creators to show yet.
          </p>
          <p class="mt-2 max-w-xl text-base leading-relaxed text-muted">
            Publish a collection for one workflow, or sign in so skilld can find SKILL.md files in your public repositories.
          </p>
          <UButton
            to="/collections/new"
            label="Publish the first collection"
            trailing-icon="i-lucide-arrow-right"
            class="mt-5 min-h-11"
          />
        </div>
      </div>

      <div v-else-if="!filteredCreators.length" class="py-8">
        <div role="status" class="editorial-state">
          <p class="text-base font-medium">
            No creators match this view.
          </p>
          <p class="mt-2 text-base leading-relaxed text-muted">
            Show everyone to see collections and individual skills together.
          </p>
          <UButton
            label="Show everyone"
            color="neutral"
            variant="outline"
            class="mt-5 min-h-11"
            @click="activeFilter = 'all'"
          />
        </div>
      </div>

      <ul v-else id="community-creator-list" class="editorial-ledger list-none p-0">
        <li v-for="creator in filteredCreators" :key="creator.id">
          <CommunityCreator :creator="creator" />
        </li>
      </ul>
    </section>
  </div>
</template>
