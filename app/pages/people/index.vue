<script setup lang="ts">
import type { IndexedCurator } from '../../../server/utils/atproto/curator-index'

useSeoMeta({
  title: 'Curators',
  description: 'Developers who curate agent skill collections on skilld.',
})

defineOgImage('Page.takumi', {
  title: 'Curators',
  description: 'Developers who curate agent skill collections on skilld.',
}, { alt: 'Curators directory on skilld' })

const { data, status, error, refresh } = useFetch<{ curators: IndexedCurator[], total: number }>('/api/social/curators')
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
        Developers who curate agent skill collections. Follow their taste, install their setup.
      </p>
    </section>

    <USeparator />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="curators-list-heading"
    >
      <h2
        id="curators-list-heading"
        class="sr-only"
      >
        Curator directory
      </h2>

      <!-- Loading -->
      <div
        v-if="status === 'pending'"
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
        v-else-if="error"
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
          @click="refresh()"
        />
      </div>

      <!-- Empty -->
      <div
        v-else-if="!data?.curators.length"
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
          v-for="curator in data.curators"
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
        v-if="data?.total"
        class="mt-6 data-label"
      >
        {{ data.total }} {{ data.total === 1 ? 'curator' : 'curators' }}
      </p>
    </section>
  </div>
</template>
