<script setup lang="ts">
import type { IndependentDev } from '../../../server/api/people/independent.get'
import type { IndexedCurator } from '../../../server/utils/atproto/curator-index'

type Filter = 'all' | 'independent' | 'community'

useSeoMeta({
  title: 'Curators',
  description: 'Developers who curate agent skill collections, plus independent developers shipping their own skill repos.',
})

defineOgImage('Page.takumi', {
  title: 'Curators',
  description: 'Developers who curate agent skill collections, plus independent developers shipping their own skill repos.',
}, { alt: 'Curators directory on skilld' })

const route = useRoute()
const router = useRouter()

const filter = computed<Filter>(() => {
  const q = route.query.filter
  if (q === 'independent' || q === 'community')
    return q
  return 'all'
})

function setFilter(next: Filter) {
  const query = next === 'all' ? {} : { filter: next }
  navigateTo({ query }, { replace: true })
}

const showIndependent = computed(() => filter.value === 'all' || filter.value === 'independent')
const showCommunity = computed(() => filter.value === 'all' || filter.value === 'community')

const { isBot } = useBotDetection()

const {
  data: independentData,
  status: independentStatus,
  error: independentError,
  refresh: refreshIndependent,
} = useFetch<{ devs: IndependentDev[], total: number }>('/api/people/independent', {
  lazy: !isBot.value,
})

const {
  data: communityData,
  status: communityStatus,
  error: communityError,
  refresh: refreshCommunity,
} = useFetch<{ curators: IndexedCurator[], total: number }>('/api/social/curators', {
  lazy: !isBot.value,
})

const filterOptions: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'independent', label: 'Independent' },
  { value: 'community', label: 'Community' },
]
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="people-heading"
    >
      <h1
        id="people-heading"
        class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
      >
        Curators
      </h1>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Developers who curate agent skill collections. Browse their stack, follow their taste.
      </p>
    </section>

    <USeparator />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-6"
      aria-label="Filter directory"
    >
      <div
        role="group"
        aria-label="Curator type"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="opt in filterOptions"
          :key="opt.value"
          :label="opt.label"
          :color="filter === opt.value ? 'primary' : 'neutral'"
          :variant="filter === opt.value ? 'solid' : 'outline'"
          size="sm"
          :aria-pressed="filter === opt.value"
          @click="setFilter(opt.value)"
        />
      </div>
    </section>

    <!-- Independent section -->
    <section
      v-if="showIndependent"
      class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 md:pb-12"
      aria-labelledby="independent-heading"
    >
      <div class="mb-4">
        <h2
          id="independent-heading"
          class="section-label"
        >
          Independent
        </h2>
        <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
          Developers maintaining their own skill repos. Browse their stack, install what fits.
        </p>
      </div>

      <!-- Loading -->
      <div
        v-if="independentStatus === 'pending'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <div class="flex items-center gap-3">
            <USkeleton class="size-10 rounded-full" />
            <div class="space-y-1.5 flex-1">
              <USkeleton class="h-4 w-2/3" />
              <USkeleton class="h-3 w-1/3" />
            </div>
          </div>
          <USkeleton class="mt-3 h-3 w-full" />
        </div>
      </div>

      <!-- Error -->
      <div
        v-else-if="independentError"
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load independent developers. Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="refreshIndependent()"
        />
      </div>

      <!-- Empty -->
      <div
        v-else-if="!independentData?.devs.length"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-users"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          No independent developers indexed yet.
        </p>
      </div>

      <!-- Cards -->
      <div
        v-else
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <PeopleIndependentCard
          v-for="dev in independentData.devs"
          :key="dev.owner"
          :dev="dev"
        />
      </div>

      <p
        v-if="independentData?.total"
        class="mt-6 data-label"
      >
        {{ independentData.total }} {{ independentData.total === 1 ? 'developer' : 'developers' }}
      </p>
    </section>

    <USeparator v-if="showIndependent && showCommunity" />

    <!-- Community section -->
    <section
      v-if="showCommunity"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="community-heading"
    >
      <div class="mb-4">
        <h2
          id="community-heading"
          class="section-label"
        >
          Community
        </h2>
        <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
          Developers publishing collections on skilld via the AT Protocol.
        </p>
      </div>

      <!-- Loading -->
      <div
        v-if="communityStatus === 'pending'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <div class="flex items-center gap-3">
            <USkeleton class="size-10 rounded-full" />
            <div class="space-y-1.5 flex-1">
              <USkeleton class="h-4 w-2/3" />
              <USkeleton class="h-3 w-1/3" />
            </div>
          </div>
          <USkeleton class="mt-3 h-3 w-full" />
        </div>
      </div>

      <!-- Error -->
      <div
        v-else-if="communityError"
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load curators. Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="refreshCommunity()"
        />
      </div>

      <!-- Empty -->
      <div
        v-else-if="!communityData?.curators.length"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-users"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          No curators yet. Be the first to publish a collection.
        </p>
      </div>

      <!-- Curator grid -->
      <div
        v-else
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <NuxtLink
          v-for="curator in communityData.curators"
          :key="curator.did"
          :to="`/people/${curator.handle}`"
          :aria-label="`${curator.displayName || curator.handle}, ${curator.collectionCount} collections`"
          class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
        >
          <div class="flex items-start gap-3">
            <img
              v-if="curator.avatar"
              :src="curator.avatar"
              :alt="`Avatar for ${curator.displayName || curator.handle}`"
              width="40"
              height="40"
              loading="lazy"
              decoding="async"
              class="size-10 rounded-full"
            >
            <div
              v-else
              class="flex size-10 items-center justify-center rounded-full bg-muted"
            >
              <UIcon
                name="i-lucide-user"
                class="size-5 text-muted"
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">
                {{ curator.displayName || curator.handle }}
              </p>
              <p class="font-mono text-xs text-muted">
                @{{ curator.handle }}
              </p>
            </div>
          </div>

          <CuratorLabels
            v-if="curator.labels?.length"
            :labels="curator.labels"
            class="mt-3"
          />

          <div class="mt-3 flex items-center gap-3">
            <span class="data-label">{{ curator.collectionCount }} {{ curator.collectionCount === 1 ? 'collection' : 'collections' }}</span>
            <span class="data-label ml-auto">{{ useTimeAgo(curator.lastPublished).value }}</span>
          </div>
        </NuxtLink>
      </div>

      <p
        v-if="communityData?.total"
        class="mt-6 data-label"
      >
        {{ communityData.total }} {{ communityData.total === 1 ? 'curator' : 'curators' }}
      </p>
    </section>
  </div>
</template>
