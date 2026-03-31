<script setup lang="ts">
const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

useSeoMeta({
  title: 'Package Skills — skilld',
  description: 'Browse curated package skills for npm packages. Find the right skill for your stack.',
})

defineOgImage('Page.takumi', {
  title: 'Package Skills',
  description: 'Browse curated package skills for npm packages. Find the right skill for your stack.',
}, { alt: 'Package skills directory on skilld' })

// URL-synced state
const route = useRoute()

const search = ref((route.query.q as string) || '')
const page = ref(Number(route.query.page) || 1)
const sort = ref((route.query.sort as string) || 'name')
const official = ref(route.query.official === 'true')
const selectedOwner = ref((route.query.owner as string) || '')
const view = ref<'grid' | 'list'>((route.query.view as 'grid' | 'list') || 'grid')

const debouncedSearch = refDebounced(search, 300)

// Sync state to URL
watch([debouncedSearch, page, sort, official, selectedOwner, view], async () => {
  const query: Record<string, string> = {}
  if (debouncedSearch.value)
    query.q = debouncedSearch.value
  if (page.value > 1)
    query.page = String(page.value)
  if (sort.value !== 'name')
    query.sort = sort.value
  if (official.value)
    query.official = 'true'
  if (selectedOwner.value)
    query.owner = selectedOwner.value
  if (view.value !== 'grid')
    query.view = view.value
  await navigateTo({ query }, { replace: true })
})

// Reset page on filter changes
watch([debouncedSearch, sort, official, selectedOwner], () => {
  page.value = 1
})

const { isBot } = useBotDetection()
const { data, status, error, refresh } = useFetch('/api/skills', {
  query: {
    q: debouncedSearch,
    page,
    limit: 60,
    sort,
    official,
    owner: selectedOwner,
  },
  watch: [debouncedSearch, page, sort, official, selectedOwner],
  lazy: !isBot.value,
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
const copiedSlug = ref<string | null>(null)

function skillSlug(skill: { owner: string, repo: string, name: string }) {
  return `${skill.owner}/${skill.repo === 'skills' ? skill.name : `${skill.repo}/${skill.name}`}`
}

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return `/skills/${skillSlug(skill)}`
}

function skillInstallCmd(skill: { name: string }) {
  return `skilld add npm:${skill.name}`
}

function copyInstall(skill: { owner: string, repo: string, name: string }) {
  const slug = skillSlug(skill)
  copy(skillInstallCmd(skill))
  copiedSlug.value = slug
  setTimeout(() => {
    if (copiedSlug.value === slug)
      copiedSlug.value = null
  }, 2000)
}

function clearFilters() {
  search.value = ''
  sort.value = 'name'
  official.value = false
  selectedOwner.value = ''
  page.value = 1
}

const hasActiveFilters = computed(() =>
  search.value || official.value || selectedOwner.value || sort.value !== 'name',
)

// Highlight search matches in text
function highlight(text: string): string {
  if (!debouncedSearch.value)
    return text
  const escaped = debouncedSearch.value.replace(REGEX_ESCAPE_RE, '\\$&')
  return text.replace(

    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="bg-primary/20 text-inherit rounded-sm px-0.5">$1</mark>',
  )
}

const sortOptions = [
  { label: 'Name', value: 'name', icon: 'i-lucide-arrow-down-a-z' },
  { label: 'Owner', value: 'owner', icon: 'i-lucide-users' },
]
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
        Package Skills
      </h1>
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Browse {{ data?.total?.toLocaleString() ?? '' }} curated package skills. One canonical skill per npm package, maintained by skilld.
      </p>

      <!-- Search + filters bar -->
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative max-w-md flex-1">
          <label for="skill-search" class="sr-only">Search skills</label>
          <UInput
            id="skill-search"
            ref="searchInput"
            v-model="search"
            placeholder="Search skills..."
            icon="i-lucide-search"
            size="lg"
            class="font-mono"
            :loading="status === 'pending'"
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

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Official filter -->
          <UButton
            :icon="official ? 'i-lucide-badge-check' : 'i-lucide-badge-check'"
            :label="official ? 'Official' : 'Official'"
            size="sm"
            :color="official ? 'primary' : 'neutral'"
            :variant="official ? 'subtle' : 'outline'"
            class="font-mono"
            @click="official = !official"
          />

          <!-- Sort -->
          <USelectMenu
            v-model="sort"
            :items="sortOptions"
            value-key="value"
            size="sm"
            class="font-mono w-32"
            :ui="{ itemLeadingIcon: 'size-4' }"
          >
            <template #leading>
              <UIcon
                :name="sortOptions.find(o => o.value === sort)?.icon || 'i-lucide-arrow-down-a-z'"
                class="size-4 text-muted"
              />
            </template>
          </USelectMenu>

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

          <!-- Clear all filters -->
          <UButton
            v-if="hasActiveFilters"
            label="Clear"
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="ghost"
            class="font-mono"
            @click="clearFilters"
          />
        </div>
      </div>

      <!-- Owner facet chips -->
      <div
        v-if="data?.facets?.owners?.length && !selectedOwner"
        class="mt-4 flex items-center gap-2 flex-wrap"
      >
        <span class="data-label shrink-0">Top owners</span>
        <button
          v-for="facet in data.facets.owners.slice(0, 12)"
          :key="facet.name"
          class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors duration-200 border-default text-muted hover:border-[var(--ui-text-muted)] hover:text-default"
          @click="selectedOwner = facet.name"
        >
          <span>{{ facet.name }}</span>
          <span class="data-label">{{ facet.count }}</span>
          <UIcon
            v-if="facet.official"
            name="i-lucide-badge-check"
            class="size-3 text-primary"
          />
        </button>
      </div>

      <!-- Active owner filter -->
      <div
        v-if="selectedOwner"
        class="mt-4 flex items-center gap-2"
      >
        <span class="data-label">Filtering by</span>
        <button
          class="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-xs text-primary transition-colors duration-200 hover:bg-primary/10"
          @click="selectedOwner = ''"
        >
          <span>{{ selectedOwner }}</span>
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>
    </section>

    <USeparator />

    <section
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="skills-results-heading"
    >
      <h2 id="skills-results-heading" class="sr-only">
        Skills results
      </h2>

      <!-- Screen reader status -->
      <div aria-live="polite" aria-atomic="true" class="sr-only">
        <template v-if="status === 'pending' && !data">
          Loading skills...
        </template>
        <template v-else-if="error">
          Error loading skills.
        </template>
        <template v-else-if="data && data.items.length === 0">
          No skills found{{ search ? ` for "${search}"` : '' }}.
        </template>
        <template v-else-if="data">
          {{ data.total }} skills found. Showing page {{ data.page }} of {{ data.pages }}.
        </template>
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="status === 'pending' && !data"
        :class="[
          view === 'grid'
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
            : 'flex flex-col gap-2',
        ]"
        aria-busy="true"
        aria-label="Loading skills"
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

      <!-- Error state -->
      <div
        v-else-if="error"
        role="alert"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon name="i-lucide-alert-circle" class="mx-auto size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 text-sm">
          Couldn't load skills. Check your connection and try again.
        </p>
        <UButton label="Retry" size="sm" variant="outline" color="neutral" class="mt-4" @click="refresh()" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="data && data.items.length === 0"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 text-sm">
          No skills found{{ search ? ` for "${search}"` : '' }}. Try a different search term.
        </p>
        <UButton
          v-if="hasActiveFilters"
          label="Clear filters"
          size="sm"
          variant="outline"
          color="neutral"
          class="mt-4"
          @click="clearFilters"
        />
      </div>

      <!-- Grid view -->
      <ul
        v-else-if="data && view === 'grid'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li v-for="skill in data.items" :key="skill.slug">
          <NuxtLink
            :to="skillPath(skill)"
            :aria-label="`${skill.name} by ${skill.owner}`"
            class="group block rounded-lg border border-default p-4 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <p class="font-mono text-sm font-medium truncate" v-html="highlight(skill.name)" />
                  <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
                </div>
                <p class="mt-0.5 text-xs text-muted truncate" v-html="highlight(skill.owner + (skill.repo !== 'skills' ? `/${skill.repo}` : ''))" />
              </div>
              <UButton
                :icon="copiedSlug === skillSlug(skill) ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                color="neutral"
                variant="ghost"
                class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                :aria-label="copiedSlug === skillSlug(skill) ? 'Copied' : `Copy install command for ${skill.name}`"
                @click.prevent="copyInstall(skill)"
              />
            </div>

            <code class="mt-3 block truncate rounded bg-muted px-2.5 py-1.5 font-mono text-xs text-muted">
              {{ skillInstallCmd(skill) }}
            </code>
          </NuxtLink>
        </li>
      </ul>

      <!-- List view -->
      <ul
        v-else-if="data && view === 'list'"
        class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
      >
        <li v-for="skill in data.items" :key="skill.slug">
          <NuxtLink
            :to="skillPath(skill)"
            :aria-label="`${skill.name} by ${skill.owner}`"
            class="group flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-elevated"
          >
            <div class="min-w-0 flex-1 flex items-center gap-3">
              <div class="flex items-center gap-1.5 shrink-0">
                <p class="font-mono text-sm font-medium truncate" v-html="highlight(skill.name)" />
                <UBadge label="npm" variant="subtle" color="neutral" size="xs" class="shrink-0" />
              </div>
              <p class="text-xs text-muted truncate" v-html="highlight(skill.owner + (skill.repo !== 'skills' ? `/${skill.repo}` : ''))" />
            </div>
            <code class="hidden sm:block truncate font-mono text-xs text-muted max-w-xs">
              {{ skillInstallCmd(skill) }}
            </code>
            <UButton
              :icon="copiedSlug === skillSlug(skill) ? 'i-lucide-check' : 'i-lucide-copy'"
              size="xs"
              color="neutral"
              variant="ghost"
              class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              :aria-label="copiedSlug === skillSlug(skill) ? 'Copied' : `Copy install command for ${skill.name}`"
              @click.prevent="copyInstall(skill)"
            />
          </NuxtLink>
        </li>
      </ul>

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
