<script setup lang="ts">
useSeoMeta({
  title: 'Official Skills — skilld',
  description: 'Skills from the companies and organizations that build the technology. The makers teaching agents how to use their products.',
})

defineOgImage('Page.takumi', {
  title: 'Official',
  description: 'Skills from the companies and organizations that build the technology.',
}, { alt: 'Official skills on skilld' })

const search = ref('')
const debouncedSearch = refDebounced(search, 300)

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch('/api/official-repos', {
  query: { q: debouncedSearch },
  watch: [debouncedSearch],
  lazy: !isBot.value,
})
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="official-heading"
    >
      <div class="flex items-center gap-3">
        <h1
          id="official-heading"
          class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
        >
          Official
        </h1>
        <UBadge
          label="New"
          color="primary"
          variant="subtle"
          size="xs"
        />
      </div>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Skills from the companies and organizations that build the technology. The makers teaching agents how to use their products.
      </p>

      <div class="mt-4 flex items-center gap-4">
        <span
          v-if="data"
          class="data-label"
        >
          {{ data.total }} organizations, {{ data.totalSkills }} skills
        </span>
      </div>

      <div class="mt-6 max-w-md">
        <label
          for="official-search"
          class="sr-only"
        >Search organizations</label>
        <UInput
          id="official-search"
          v-model="search"
          placeholder="Search organizations..."
          icon="i-lucide-search"
          size="lg"
          class="font-mono"
          :loading="status === 'pending'"
        />
      </div>
    </section>

    <USeparator />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="official-results-heading"
    >
      <h2
        id="official-results-heading"
        class="sr-only"
      >
        Official skill repositories
      </h2>

      <div
        aria-live="polite"
        aria-atomic="true"
        class="sr-only"
      >
        <template v-if="status === 'pending' && !data">
          Loading official repositories...
        </template>
        <template v-else-if="error">
          Error loading official repositories.
        </template>
        <template v-else-if="data && data.items.length === 0">
          No organizations found for "{{ search }}".
        </template>
        <template v-else-if="data">
          {{ data.total }} organizations found.
        </template>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="status === 'pending' && !data"
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
          Couldn't load official repositories. Check your connection and try again.
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

      <!-- Empty state -->
      <div
        v-else-if="data && data.items.length === 0"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-8 text-muted"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          No organizations found for "{{ search }}". Try a different search term.
        </p>
      </div>

      <!-- Org grid -->
      <ul
        v-else-if="data"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li
          v-for="repo in data.items"
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
