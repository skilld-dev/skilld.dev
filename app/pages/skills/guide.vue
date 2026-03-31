<script setup lang="ts">
useSeoMeta({
  title: 'Guide Skills — skilld',
  description: 'Skills authored by developers and organizations. General knowledge, best practices, and workflows not tied to a specific npm package.',
})

defineOgImage('Page.takumi', {
  title: 'Guide Skills',
  description: 'Skills authored by developers and organizations.',
}, { alt: 'Guide skills on skilld' })

const route = useRoute()
const tab = ref((route.query.tab as string) || 'all')

// Official repos data (for the Official tab)
const officialSearch = ref('')
const debouncedOfficialSearch = refDebounced(officialSearch, 300)

const { isBot } = useBotDetection()
const { data: officialData, status: officialStatus, error: officialError, refresh: officialRefresh } = useFetch('/api/official-repos', {
  query: { q: debouncedOfficialSearch },
  watch: [debouncedOfficialSearch],
  lazy: !isBot.value,
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Official', value: 'official' },
]
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="guide-heading"
    >
      <h1
        id="guide-heading"
        class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
      >
        Guide Skills
      </h1>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Skills authored by developers and organizations. General knowledge, best practices, and workflows not tied to a specific npm package.
      </p>

      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        variant="link"
        color="neutral"
        size="sm"
        class="mt-6"
      />
    </section>

    <USeparator />

    <!-- All guide skills tab -->
    <section
      v-if="tab === 'all'"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="all-guide-heading"
    >
      <h2 id="all-guide-heading" class="sr-only">
        All guide skills
      </h2>

      <div class="rounded-lg border border-default p-8 text-center">
        <UIcon
          name="i-lucide-book-open"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm font-medium">
          Guide skills are coming soon
        </p>
        <p class="mt-1.5 text-xs text-muted max-w-sm mx-auto leading-relaxed">
          Guide skills cover topics like testing strategy, accessibility, and code review patterns. They're authored by developers and distributed as git repositories.
        </p>
      </div>
    </section>

    <!-- Official tab -->
    <section
      v-if="tab === 'official'"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="official-results-heading"
    >
      <div class="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div class="flex items-center gap-3">
          <span
            v-if="officialData"
            class="data-label"
          >
            {{ officialData.total }} organizations, {{ officialData.totalSkills }} skills
          </span>
        </div>

        <div class="max-w-md flex-1">
          <label for="official-search" class="sr-only">Search organizations</label>
          <UInput
            id="official-search"
            v-model="officialSearch"
            placeholder="Search organizations..."
            icon="i-lucide-search"
            size="sm"
            class="font-mono"
            :loading="officialStatus === 'pending'"
          />
        </div>
      </div>

      <h2 id="official-results-heading" class="sr-only">
        Official skill repositories
      </h2>

      <div
        aria-live="polite"
        aria-atomic="true"
        class="sr-only"
      >
        <template v-if="officialStatus === 'pending' && !officialData">
          Loading official repositories...
        </template>
        <template v-else-if="officialError">
          Error loading official repositories.
        </template>
        <template v-else-if="officialData && officialData.items.length === 0">
          No organizations found for "{{ officialSearch }}".
        </template>
        <template v-else-if="officialData">
          {{ officialData.total }} organizations found.
        </template>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="officialStatus === 'pending' && !officialData"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading official repositories"
      >
        <div
          v-for="i in 12"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <div class="flex items-center gap-3">
            <USkeleton class="size-8 rounded-full" />
            <div class="flex-1">
              <USkeleton class="h-4 w-2/3" />
              <USkeleton class="mt-1.5 h-3 w-1/3" />
            </div>
          </div>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-else-if="officialError"
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load official repositories. Check your connection and try again.
        </p>
        <UButton
          label="Retry"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="officialRefresh()"
        />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="officialData && officialData.items.length === 0"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          No organizations found for "{{ officialSearch }}". Try a different search term.
        </p>
      </div>

      <!-- Org grid -->
      <ul
        v-else-if="officialData"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li
          v-for="repo in officialData.items"
          :key="`${repo.owner}/${repo.repo}`"
        >
          <NuxtLink
            :to="`/skills?q=${repo.owner}`"
            :aria-label="`${repo.owner}: ${repo.skills} skills in ${repo.repo}`"
            class="group flex items-center gap-3 rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <img
              :src="`https://github.com/${repo.owner}.png?size=64`"
              :alt="`${repo.owner} avatar`"
              width="32"
              height="32"
              class="size-8 rounded-full bg-muted"
              loading="lazy"
            >
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium truncate">
                {{ repo.owner }}
              </p>
              <p class="mt-0.5 text-xs text-muted truncate">
                {{ repo.repo }}
              </p>
            </div>
            <span class="data-label shrink-0">
              {{ repo.skills }} {{ repo.skills === 1 ? 'skill' : 'skills' }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
