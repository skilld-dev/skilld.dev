<script setup lang="ts">
useSeoMeta({
  title: 'Skills — skilld',
  description: 'Browse and search AI agent skills. Find the right skill for your stack.',
})

const search = ref('')
const page = ref(1)
const debouncedSearch = refDebounced(search, 300)

const { data, status, error, refresh } = useFetch('/api/skills', {
  query: { q: debouncedSearch, page, limit: 60 },
  watch: [debouncedSearch, page],
})

watch(debouncedSearch, () => {
  page.value = 1
})

const { copy, copied } = useClipboard()

function copyInstall(owner: string, repo: string, name: string) {
  copy(`skilld add ${owner}/${repo === 'skills' ? name : `${repo}/${name}`}`)
}
</script>

<template>
  <div>
    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-6 md:pt-16 md:pb-8"
      aria-labelledby="skills-heading"
    >
      <h1
        id="skills-heading"
        class="font-mono text-2xl sm:text-3xl font-medium tracking-tight"
      >
        Skills
      </h1>
      <p class="mt-2 text-sm text-[var(--ui-text-muted)] max-w-lg leading-relaxed">
        Browse {{ data?.total?.toLocaleString() ?? '' }} skills from the community. Search by name, author, or topic.
      </p>

      <div class="mt-6 max-w-md">
        <label
          for="skill-search"
          class="sr-only"
        >Search skills</label>
        <UInput
          id="skill-search"
          v-model="search"
          placeholder="Search skills..."
          icon="i-lucide-search"
          size="lg"
          class="font-mono"
          :loading="status === 'pending'"
        />
      </div>
    </section>

    <UDivider />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="skills-heading"
    >
      <!-- Screen reader status for search results -->
      <div
        aria-live="polite"
        aria-atomic="true"
        class="sr-only"
      >
        <template v-if="status === 'pending' && !data">
          Loading skills...
        </template>
        <template v-else-if="error">
          Error loading skills.
        </template>
        <template v-else-if="data && data.items.length === 0">
          No skills found for "{{ search }}".
        </template>
        <template v-else-if="data">
          {{ data.total }} skills found. Showing page {{ data.page }} of {{ data.pages }}.
        </template>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="status === 'pending' && !data"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading skills"
      >
        <div
          v-for="i in 12"
          :key="i"
          class="rounded-lg border border-[var(--ui-border)] p-4"
        >
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="mt-2 h-3 w-1/2" />
          <USkeleton class="mt-4 h-3 w-full" />
        </div>
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        role="alert"
        class="rounded-lg border border-[var(--ui-border)] p-8 text-center"
      >
        <UIcon
          name="i-lucide-alert-circle"
          class="mx-auto size-8 text-[var(--ui-text-muted)]"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          Couldn't load skills. Check your connection and try again.
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
        class="rounded-lg border border-[var(--ui-border)] p-8 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-8 text-[var(--ui-text-muted)]"
          aria-hidden="true"
        />
        <p class="mt-3 text-sm">
          No skills found for "{{ search }}". Try a different search term.
        </p>
      </div>

      <!-- Skills grid -->
      <div
        v-else-if="data"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="list"
      >
        <article
          v-for="skill in data.items"
          :key="skill.slug"
          role="listitem"
          class="group rounded-lg border border-[var(--ui-border)] p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-sm font-medium truncate">
                {{ skill.name }}
              </p>
              <p class="mt-0.5 text-xs text-[var(--ui-text-muted)] truncate">
                {{ skill.owner }}{{ skill.repo !== 'skills' ? `/${skill.repo}` : '' }}
              </p>
            </div>
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              size="xs"
              color="neutral"
              variant="ghost"
              class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="copied ? 'Copied' : `Copy install command for ${skill.name}`"
              @click="copyInstall(skill.owner, skill.repo, skill.name)"
            />
          </div>

          <code class="mt-3 block truncate rounded bg-[var(--ui-bg-muted)] px-2.5 py-1.5 font-mono text-xs text-[var(--ui-text-muted)]">
            skilld add {{ skill.owner }}/{{ skill.repo === 'skills' ? skill.name : `${skill.repo}/${skill.name}` }}
          </code>
        </article>
      </div>

      <!-- Pagination -->
      <nav
        v-if="data && data.pages > 1"
        aria-label="Pagination"
        class="mt-8 flex items-center justify-center gap-2"
      >
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Previous page"
          :disabled="page <= 1"
          @click="page--"
        />
        <span class="data-label">
          Page {{ data.page }} of {{ data.pages }}
        </span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Next page"
          :disabled="page >= data.pages"
          @click="page++"
        />
      </nav>
    </section>
  </div>
</template>
