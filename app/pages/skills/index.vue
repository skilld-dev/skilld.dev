<script setup lang="ts">
import type { NpmSearchResult } from '~/composables/useNpmSearch'

const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

useSeoMeta({
  title: 'NPM Skills — skilld',
  description: 'Browse curated skills for npm packages. Search any package and get its skill page.',
})

defineOgImage('Page.takumi', {
  title: 'NPM Skills',
  description: 'Browse curated skills for npm packages. Search any package and get its skill page.',
}, { alt: 'NPM skills on skilld' })

const route = useRoute()
const search = ref((route.query.q as string) || '')
const page = ref(Number(route.query.page) || 1)
const view = ref<'grid' | 'list'>((route.query.view as 'grid' | 'list') || 'grid')
const debouncedSearch = refDebounced(search, 300)

// Sync state to URL
watch([debouncedSearch, page, view], async () => {
  const query: Record<string, string> = {}
  if (debouncedSearch.value)
    query.q = debouncedSearch.value
  if (page.value > 1)
    query.page = String(page.value)
  if (view.value !== 'grid')
    query.view = view.value
  await navigateTo({ query }, { replace: true })
})

watch(debouncedSearch, () => {
  page.value = 1
})

const PAGE_SIZE = 21
const { search: npmSearch } = useNpmSearch()

// Algolia search results
const npmResults = ref<NpmSearchResult[]>([])
const npmTotal = ref(0)
const npmStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

// Also fetch existing skills from the registry for the default view
const { isBot } = useBotDetection()
const { data: registryData, status: registryStatus } = useFetch('/api/skills', {
  query: { q: debouncedSearch, page, limit: PAGE_SIZE, sort: 'name' },
  watch: [debouncedSearch, page],
  lazy: !isBot.value,
})

// Run Algolia search when query changes
watch(debouncedSearch, async (q) => {
  if (!q) {
    npmResults.value = []
    npmTotal.value = 0
    npmStatus.value = 'idle'
    return
  }
  npmStatus.value = 'pending'
  try {
    const res = await npmSearch(q, {
      size: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    npmResults.value = res.results
    npmTotal.value = res.total
    npmStatus.value = 'success'
  }
  catch {
    npmStatus.value = 'error'
  }
}, { immediate: !!search.value })

// Also re-fetch Algolia on page change when searching
watch(page, async () => {
  if (!debouncedSearch.value)
    return
  npmStatus.value = 'pending'
  try {
    const res = await npmSearch(debouncedSearch.value, {
      size: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    npmResults.value = res.results
    npmTotal.value = res.total
    npmStatus.value = 'success'
  }
  catch {
    npmStatus.value = 'error'
  }
})

// When searching, use Algolia results; when browsing, use registry
const isSearching = computed(() => !!debouncedSearch.value)
const totalPages = computed(() => {
  if (isSearching.value)
    return Math.ceil(npmTotal.value / PAGE_SIZE)
  return registryData.value?.pages ?? 1
})

const isLoading = computed(() => {
  if (isSearching.value)
    return npmStatus.value === 'pending'
  return registryStatus.value === 'pending' && !registryData.value
})

// Keyboard shortcut: / to focus search
const searchInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const activeElement = useActiveElement()
const searchFocused = computed(() => activeElement.value === searchInput.value?.inputRef)

onKeyStroke('/', (e) => {
  const el = searchInput.value?.inputRef
  if (searchFocused.value)
    return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
    return
  e.preventDefault()
  el?.focus()
})

const { copy } = useClipboard()
const copiedName = ref<string | null>(null)

function copyInstall(name: string) {
  copy(`skilld add npm:${name}`)
  copiedName.value = name
  setTimeout(() => {
    if (copiedName.value === name)
      copiedName.value = null
  }, 2000)
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)
    return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function highlight(text: string): string {
  if (!debouncedSearch.value)
    return text
  const escaped = debouncedSearch.value.replace(REGEX_ESCAPE_RE, '\\$&')
  return text.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="bg-primary/20 text-inherit rounded-sm px-0.5">$1</mark>',
  )
}

// Registry skill helpers (for browse mode)
function skillSlug(skill: { owner: string, repo: string, name: string }) {
  return `${skill.owner}/${skill.repo === 'skills' ? skill.name : `${skill.repo}/${skill.name}`}`
}

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return `/skills/${skillSlug(skill)}`
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
        NPM Skills
      </h1>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Search any npm package to view its skill page. One canonical skill per package, generated on demand.
      </p>

      <!-- Search bar -->
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative max-w-md flex-1">
          <label for="skill-search" class="sr-only">Search npm packages</label>
          <UInput
            id="skill-search"
            ref="searchInput"
            v-model="search"
            placeholder="Search npm packages..."
            icon="i-lucide-search"
            size="lg"
            class="font-mono"
            :loading="isLoading"
          >
            <template #trailing>
              <UKbd
                v-if="!search && !searchFocused"
                value="/"
                size="sm"
              />
              <UButton
                v-else-if="search"
                icon="i-lucide-x"
                color="neutral"
                variant="link"
                size="xs"
                aria-label="Clear search"
                @click="search = ''"
              />
            </template>
          </UInput>
        </div>

        <div class="flex items-center gap-2">
          <!-- View toggle -->
          <div class="flex items-center border border-default rounded-lg overflow-hidden">
            <button
              class="p-1.5 transition-colors duration-200" :class="[
                view === 'grid' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default',
              ]"
              aria-label="Grid view"
              @click="view = 'grid'"
            >
              <UIcon name="i-lucide-layout-grid" class="size-4" />
            </button>
            <button
              class="p-1.5 transition-colors duration-200" :class="[
                view === 'list' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default',
              ]"
              aria-label="List view"
              @click="view = 'list'"
            >
              <UIcon name="i-lucide-list" class="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <USeparator />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="skills-results-heading"
    >
      <h2 id="skills-results-heading" class="sr-only">
        {{ isSearching ? 'Search results' : 'Skills' }}
      </h2>

      <!-- Screen reader status -->
      <div aria-live="polite" aria-atomic="true" class="sr-only">
        <template v-if="isLoading">
          Loading...
        </template>
        <template v-else-if="isSearching && npmResults.length === 0">
          No packages found for "{{ search }}".
        </template>
        <template v-else-if="isSearching">
          {{ npmTotal }} packages found.
        </template>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="isLoading"
        :class="[
          view === 'grid'
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
            : 'flex flex-col gap-2',
        ]"
        aria-busy="true"
        aria-label="Loading"
      >
        <div
          v-for="i in 12"
          :key="i"
          class="rounded-lg border border-default p-4"
        >
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="mt-2 h-3 w-1/2" />
          <USkeleton v-if="view === 'grid'" class="mt-4 h-3 w-full" />
        </div>
      </div>

      <!-- ===== SEARCH MODE: Algolia npm results ===== -->
      <template v-else-if="isSearching">
        <!-- Empty state -->
        <div
          v-if="npmResults.length === 0 && npmStatus !== 'pending'"
          class="rounded-lg border border-default p-8 text-center"
        >
          <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" aria-hidden="true" />
          <p class="mt-3 text-sm">
            No packages found for "{{ search }}". Try a different search term.
          </p>
        </div>

        <!-- Grid view -->
        <ul
          v-else-if="view === 'grid'"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
        >
          <li v-for="pkg in npmResults" :key="pkg.name">
            <NuxtLink
              :to="`/skills/${pkg.name}`"
              :aria-label="`${pkg.name} v${pkg.version}`"
              class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p class="font-mono text-sm font-medium truncate" v-html="highlight(pkg.name)" />
                    <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                  </div>
                  <p class="mt-0.5 text-xs text-muted truncate">
                    v{{ pkg.version }}
                  </p>
                </div>
                <UButton
                  :icon="copiedName === pkg.name ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  :aria-label="copiedName === pkg.name ? 'Copied' : `Copy install command for ${pkg.name}`"
                  @click.prevent="copyInstall(pkg.name)"
                />
              </div>

              <p
                v-if="pkg.description"
                class="mt-2 text-xs text-muted line-clamp-2 leading-relaxed"
              >
                {{ pkg.description }}
              </p>

              <div class="mt-3 flex items-center justify-between gap-2">
                <code class="truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted">
                  skilld add npm:{{ pkg.name }}
                </code>
                <span class="data-label shrink-0">{{ formatDownloads(pkg.weeklyDownloads) }}/wk</span>
              </div>
            </NuxtLink>
          </li>
        </ul>

        <!-- List view -->
        <ul
          v-else
          class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
        >
          <li v-for="pkg in npmResults" :key="pkg.name">
            <NuxtLink
              :to="`/skills/${pkg.name}`"
              :aria-label="`${pkg.name} v${pkg.version}`"
              class="group flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-elevated"
            >
              <div class="min-w-0 flex-1 flex items-center gap-3">
                <div class="flex items-center gap-1.5 shrink-0">
                  <p class="font-mono text-sm font-medium truncate" v-html="highlight(pkg.name)" />
                  <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                </div>
                <p class="text-xs text-muted truncate hidden sm:block">
                  {{ pkg.description }}
                </p>
              </div>
              <span class="data-label shrink-0">{{ formatDownloads(pkg.weeklyDownloads) }}/wk</span>
              <UButton
                :icon="copiedName === pkg.name ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                :aria-label="copiedName === pkg.name ? 'Copied' : `Copy install command for ${pkg.name}`"
                @click.prevent="copyInstall(pkg.name)"
              />
            </NuxtLink>
          </li>
        </ul>
      </template>

      <!-- ===== BROWSE MODE: Registry skills ===== -->
      <template v-else>
        <!-- Error state -->
        <div
          v-if="registryStatus === 'error'"
          role="alert"
          class="rounded-lg border border-default p-8 text-center"
        >
          <UIcon name="i-lucide-alert-circle" class="mx-auto size-8 text-muted" aria-hidden="true" />
          <p class="mt-3 text-sm">
            Couldn't load skills. Check your connection and try again.
          </p>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="registryData && registryData.items.length === 0"
          class="rounded-lg border border-default p-8 text-center"
        >
          <UIcon name="i-lucide-package" class="mx-auto size-8 text-muted" aria-hidden="true" />
          <p class="mt-3 text-sm">
            No skills in the registry yet. Search for any npm package above to generate one.
          </p>
        </div>

        <!-- Grid view -->
        <ul
          v-else-if="registryData && view === 'grid'"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
        >
          <li v-for="skill in registryData.items" :key="skill.slug">
            <NuxtLink
              :to="skillPath(skill)"
              :aria-label="`${skill.name} by ${skill.owner}`"
              class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p class="font-mono text-sm font-medium truncate">
                      {{ skill.name }}
                    </p>
                    <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                  </div>
                  <p class="mt-0.5 text-xs text-muted truncate">
                    {{ skill.owner }}{{ skill.repo !== 'skills' ? `/${skill.repo}` : '' }}
                  </p>
                </div>
                <UButton
                  :icon="copiedName === skill.name ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  :aria-label="copiedName === skill.name ? 'Copied' : `Copy install command for ${skill.name}`"
                  @click.prevent="copyInstall(skill.name)"
                />
              </div>

              <code class="mt-3 block truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
                skilld add npm:{{ skill.name }}
              </code>
            </NuxtLink>
          </li>
        </ul>

        <!-- List view -->
        <ul
          v-else-if="registryData && view === 'list'"
          class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
        >
          <li v-for="skill in registryData.items" :key="skill.slug">
            <NuxtLink
              :to="skillPath(skill)"
              :aria-label="`${skill.name} by ${skill.owner}`"
              class="group flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-elevated"
            >
              <div class="min-w-0 flex-1 flex items-center gap-3">
                <div class="flex items-center gap-1.5 shrink-0">
                  <p class="font-mono text-sm font-medium">
                    {{ skill.name }}
                  </p>
                  <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                </div>
                <p class="text-xs text-muted truncate">
                  {{ skill.owner }}{{ skill.repo !== 'skills' ? `/${skill.repo}` : '' }}
                </p>
              </div>
              <code class="hidden sm:block truncate font-mono text-xs text-muted max-w-xs">
                skilld add npm:{{ skill.name }}
              </code>
              <UButton
                :icon="copiedName === skill.name ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                :aria-label="copiedName === skill.name ? 'Copied' : `Copy install command for ${skill.name}`"
                @click.prevent="copyInstall(skill.name)"
              />
            </NuxtLink>
          </li>
        </ul>
      </template>

      <!-- Pagination -->
      <nav
        v-if="totalPages > 1"
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
          Page {{ page }} of {{ totalPages }}
        </span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Next page"
          :disabled="page >= totalPages"
          @click="page++"
        />
      </nav>
    </section>
  </div>
</template>
