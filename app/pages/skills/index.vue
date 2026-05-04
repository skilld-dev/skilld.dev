<script setup lang="ts">
import type { NpmSearchResult } from '~/composables/useNpmSearch'

const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

useSeoMeta({
  title: 'Skills — skilld',
  description: 'Browse curated skills from official providers and the wider community. Search any npm package to view its skill page.',
})

defineOgImage('Page.takumi', {
  title: 'Skills',
  description: 'Browse curated skills from official providers and the wider community.',
}, { alt: 'Skills on skilld' })

const route = useRoute()
const search = ref((route.query.q as string) || '')
const page = ref(Number(route.query.page) || 1)
const view = ref<'grid' | 'list'>((route.query.view as 'grid' | 'list') || 'grid')
const owner = ref((route.query.owner as string) || '')
const debouncedSearch = refDebounced(search, 300)

watch([debouncedSearch, page, view, owner], async () => {
  const query: Record<string, string> = {}
  if (debouncedSearch.value)
    query.q = debouncedSearch.value
  if (page.value > 1)
    query.page = String(page.value)
  if (view.value !== 'grid')
    query.view = view.value
  if (owner.value)
    query.owner = owner.value
  await navigateTo({ query }, { replace: true })
})

watch(debouncedSearch, (next) => {
  page.value = 1
  if (next && owner.value)
    owner.value = ''
})

watch(owner, () => {
  page.value = 1
})

const PAGE_SIZE = 21
const { search: npmSearch } = useNpmSearch()

// Algolia npm search results (search mode)
const npmResults = ref<NpmSearchResult[]>([])
const npmTotal = ref(0)
const npmStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const resolvedSkills = ref<Record<string, { owner: string, repo: string, official: boolean }>>({})

async function resolveResults(results: NpmSearchResult[]) {
  if (!results.length) {
    resolvedSkills.value = {}
    return
  }
  const items = results.map(r => ({ packageName: r.name }))
  resolvedSkills.value = await $fetch('/api/skills/resolve', {
    method: 'POST',
    body: { items },
  }).catch(() => ({}))
}

const { isBot } = useBotDetection()

const isSearching = computed(() => !!debouncedSearch.value)
const isOwnerFiltered = computed(() => !!owner.value && !isSearching.value)
const showOfficialSections = computed(() => !isSearching.value && !isOwnerFiltered.value)

// Featured developer and official sections (default home view)
const { data: featuredData, status: featuredStatus } = useFetch('/api/skills/featured', {
  key: 'skills-featured-sections',
  query: { orgs: 6, perOrg: 6, devs: 18, perDev: 6 },
  lazy: !isBot.value,
})

// Community / owner-filtered registry list
const registryQuery = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  sort: 'installs',
  ...(owner.value ? { owner: owner.value } : {}),
  ...(showOfficialSections.value ? { trustTier: 'candidate' } : {}),
}))
const { data: registryData, status: registryStatus } = useFetch('/api/skills', {
  query: registryQuery,
  watch: [page, owner, showOfficialSections],
  lazy: !isBot.value,
})

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
    await resolveResults(res.results)
    npmResults.value = res.results
    npmTotal.value = res.total
    npmStatus.value = 'success'
  }
  catch {
    npmStatus.value = 'error'
  }
}, { immediate: !!search.value })

watch(page, async () => {
  if (!debouncedSearch.value)
    return
  npmStatus.value = 'pending'
  try {
    const res = await npmSearch(debouncedSearch.value, {
      size: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    await resolveResults(res.results)
    npmResults.value = res.results
    npmTotal.value = res.total
    npmStatus.value = 'success'
  }
  catch {
    npmStatus.value = 'error'
  }
})

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

function copyCmd(name: string, cmd: string) {
  copy(cmd)
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

function skillPath(skill: { owner: string, repo: string, name: string }) {
  return repoSkillPath(skill.owner, skill.repo, skill.name)
}

function npmResultPath(name: string): string {
  const resolved = resolvedSkills.value[name]
  if (resolved)
    return skillPath({ owner: resolved.owner, repo: resolved.repo, name })
  return `https://npmx.dev/${name}`
}

function npmResultIsExternal(name: string): boolean {
  return !resolvedSkills.value[name]
}

function clearOwner() {
  owner.value = ''
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
      <p class="mt-2 text-sm text-muted max-w-lg leading-relaxed">
        Curated skills from official providers and the wider npm ecosystem. Search any package to view its skill page.
      </p>

      <!-- Owner filter chip -->
      <div v-if="isOwnerFiltered" class="mt-4 flex items-center gap-2 flex-wrap">
        <UBadge
          :label="`Filtered: ${owner}`"
          variant="subtle"
          color="neutral"
          size="sm"
          class="font-mono"
        />
        <UButton
          :to="ownerHubPath(owner)"
          icon="i-lucide-arrow-right"
          size="xs"
          color="neutral"
          variant="outline"
          label="View profile"
          trailing
        />
        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          label="Clear"
          @click="clearOwner"
        />
      </div>

      <!-- Search + view toggle -->
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
          <div class="flex items-center border border-default rounded-lg overflow-hidden">
            <button
              type="button"
              class="p-1.5 transition-colors duration-200" :class="[
                view === 'grid' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default',
              ]"
              aria-label="Grid view"
              @click="view = 'grid'"
            >
              <UIcon name="i-lucide-layout-grid" class="size-4" />
            </button>
            <button
              type="button"
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

    <!-- ===== SEARCH MODE: Algolia results ===== -->
    <section
      v-if="isSearching"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="search-results-heading"
    >
      <h2 id="search-results-heading" class="sr-only">
        Search results
      </h2>

      <div aria-live="polite" aria-atomic="true" class="sr-only">
        <template v-if="isLoading">
          Loading...
        </template>
        <template v-else-if="npmResults.length === 0">
          No packages found for "{{ search }}".
        </template>
        <template v-else>
          {{ npmTotal }} packages found.
        </template>
      </div>

      <div
        v-if="isLoading"
        :class="view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-2'"
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

      <div
        v-else-if="npmResults.length === 0"
        class="rounded-lg border border-default p-8 text-center"
      >
        <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 text-sm">
          No packages found for "{{ search }}". Try a different search term.
        </p>
      </div>

      <ul
        v-else-if="view === 'grid'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li v-for="pkg in npmResults" :key="pkg.name" class="group relative">
          <NuxtLink
            :to="npmResultPath(pkg.name)"
            :external="npmResultIsExternal(pkg.name)"
            :target="npmResultIsExternal(pkg.name) ? '_blank' : undefined"
            :rel="npmResultIsExternal(pkg.name) ? 'noopener noreferrer' : undefined"
            :aria-label="`${pkg.name} v${pkg.version}`"
            class="block rounded-lg border border-default p-4 pr-12 transition-colors duration-200 hover:border-[var(--ui-text-muted)]"
          >
            <div class="min-w-0">
              <p class="font-mono text-sm font-medium truncate" v-html="highlight(pkg.name)" />
              <p class="mt-0.5 text-xs text-muted truncate">
                v{{ pkg.version }}
              </p>
            </div>
            <p
              v-if="pkg.description"
              class="mt-2 text-xs text-muted line-clamp-2 leading-relaxed"
            >
              {{ pkg.description }}
            </p>
            <div class="mt-3 flex items-center justify-between gap-2">
              <code class="truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted">
                {{ npmInstallCmd(pkg.name) }}
              </code>
              <span class="data-label shrink-0">{{ formatDownloads(pkg.weeklyDownloads) }}/wk</span>
            </div>
          </NuxtLink>
          <UButton
            :icon="copiedName === pkg.name ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="copiedName === pkg.name ? 'Copied' : `Copy install command for ${pkg.name}`"
            @click="copyCmd(pkg.name, npmInstallCmd(pkg.name))"
          />
        </li>
      </ul>

      <ul
        v-else
        class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
      >
        <li v-for="pkg in npmResults" :key="pkg.name" class="group relative">
          <NuxtLink
            :to="npmResultPath(pkg.name)"
            :external="npmResultIsExternal(pkg.name)"
            :target="npmResultIsExternal(pkg.name) ? '_blank' : undefined"
            :rel="npmResultIsExternal(pkg.name) ? 'noopener noreferrer' : undefined"
            :aria-label="`${pkg.name} v${pkg.version}`"
            class="flex items-center gap-4 px-4 py-3 pr-12 transition-colors duration-200 hover:bg-elevated"
          >
            <div class="min-w-0 flex-1 flex items-center gap-3">
              <p class="font-mono text-sm font-medium truncate shrink-0" v-html="highlight(pkg.name)" />
              <p class="text-xs text-muted truncate hidden sm:block">
                {{ pkg.description }}
              </p>
            </div>
            <span class="data-label shrink-0">{{ formatDownloads(pkg.weeklyDownloads) }}/wk</span>
          </NuxtLink>
          <UButton
            :icon="copiedName === pkg.name ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute top-1/2 right-3 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :aria-label="copiedName === pkg.name ? 'Copied' : `Copy install command for ${pkg.name}`"
            @click="copyCmd(pkg.name, npmInstallCmd(pkg.name))"
          />
        </li>
      </ul>
    </section>

    <!-- ===== DEFAULT MODE: Official sections + Community ===== -->
    <template v-else>
      <!-- Developer sections -->
      <section
        v-if="showOfficialSections"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="developers-heading"
      >
        <div class="mb-6">
          <h2
            id="developers-heading"
            class="font-mono text-xl font-medium tracking-tight"
          >
            Developers
          </h2>
          <p class="mt-1 text-sm text-muted leading-relaxed">
            Skills published by individual developers, with the person behind the stack up front.
          </p>
        </div>

        <div
          v-if="featuredStatus === 'pending' && !featuredData"
          class="space-y-8"
          aria-busy="true"
          aria-label="Loading developers"
        >
          <div v-for="i in 3" :key="i" class="space-y-3">
            <div class="flex items-center gap-3">
              <USkeleton class="size-12 rounded-full" />
              <div class="space-y-2">
                <USkeleton class="h-4 w-40" />
                <USkeleton class="h-3 w-64" />
              </div>
            </div>
            <div class="flex gap-3 overflow-hidden">
              <USkeleton v-for="j in 3" :key="j" class="h-40 w-72 shrink-0 rounded-lg" />
            </div>
          </div>
        </div>

        <div
          v-else-if="featuredData?.devSections.length"
          class="space-y-0"
        >
          <DeveloperSkillSection
            v-for="section in featuredData.devSections"
            :key="`${section.owner}/${section.repo}`"
            :section
          />
        </div>
      </section>

      <USeparator v-if="showOfficialSections" />

      <!-- Official sections -->
      <section
        v-if="showOfficialSections"
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="official-heading"
      >
        <div class="mb-6">
          <h2
            id="official-heading"
            class="font-mono text-xl font-medium tracking-tight"
          >
            Official
          </h2>
          <p class="mt-1 text-sm text-muted leading-relaxed">
            Skills published by the companies and organizations that build the underlying technology.
          </p>
        </div>

        <!-- Featured loading -->
        <div
          v-if="featuredStatus === 'pending' && !featuredData"
          class="space-y-8"
          aria-busy="true"
          aria-label="Loading official providers"
        >
          <div v-for="i in 3" :key="i" class="space-y-3">
            <div class="flex items-center gap-3">
              <USkeleton class="size-8 rounded-full" />
              <USkeleton class="h-4 w-32" />
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <USkeleton v-for="j in 3" :key="j" class="h-20 rounded-lg" />
            </div>
          </div>
        </div>

        <div
          v-else-if="featuredData?.sections.length"
          class="space-y-10"
        >
          <div
            v-for="section in featuredData.sections"
            :key="`${section.owner}/${section.repo}`"
          >
            <div class="mb-3 flex items-center gap-3">
              <NuxtLink
                :to="ownerHubPath(section.owner)"
                :aria-label="`${section.owner} profile`"
                class="shrink-0"
              >
                <img
                  :src="`https://github.com/${section.owner}.png?size=64`"
                  :alt="`${section.owner} avatar`"
                  width="32"
                  height="32"
                  class="size-8 rounded-full bg-muted"
                  loading="lazy"
                >
              </NuxtLink>
              <h3 class="font-mono text-sm font-medium">
                <NuxtLink
                  :to="ownerHubPath(section.owner)"
                  class="hover:text-muted transition-colors"
                >
                  {{ section.owner }}
                </NuxtLink>
              </h3>
              <span class="data-label shrink-0">
                {{ section.totalSkills }} {{ section.totalSkills === 1 ? 'skill' : 'skills' }}
              </span>
              <NuxtLink
                :to="ownerHubPath(section.owner)"
                class="ml-auto font-mono text-xs text-muted hover:text-default transition-colors"
              >
                View profile →
              </NuxtLink>
            </div>

            <ul
              v-if="view === 'grid'"
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
            >
              <li v-for="skill in section.skills" :key="skill.slug">
                <SkillCard :skill show-tags />
              </li>
            </ul>

            <ul
              v-else
              class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
            >
              <li v-for="skill in section.skills" :key="skill.slug">
                <SkillCard :skill variant="list" show-tags />
              </li>
            </ul>
          </div>
        </div>
      </section>

      <USeparator v-if="showOfficialSections" />

      <!-- Community / owner-filtered registry list -->
      <section
        class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
        aria-labelledby="community-heading"
      >
        <div class="mb-6">
          <h2
            id="community-heading"
            class="font-mono text-xl font-medium tracking-tight"
          >
            {{ isOwnerFiltered ? `Skills by ${owner}` : 'Community' }}
          </h2>
          <p v-if="!isOwnerFiltered" class="mt-1 text-sm text-muted leading-relaxed">
            Candidate skills from the wider ecosystem, ranked by weekly install volume.
          </p>
        </div>

        <div aria-live="polite" aria-atomic="true" class="sr-only">
          <template v-if="isLoading">
            Loading...
          </template>
          <template v-else-if="registryData && registryData.items.length === 0">
            No skills found.
          </template>
          <template v-else-if="registryData">
            {{ registryData.total }} skills.
          </template>
        </div>

        <div
          v-if="isLoading"
          :class="view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-2'"
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

        <div
          v-else-if="registryStatus === 'error'"
          role="alert"
          class="rounded-lg border border-default p-8 text-center"
        >
          <UIcon name="i-lucide-alert-circle" class="mx-auto size-8 text-muted" aria-hidden="true" />
          <p class="mt-3 text-sm">
            Couldn't load skills. Check your connection and try again.
          </p>
        </div>

        <div
          v-else-if="registryData && registryData.items.length === 0"
          class="rounded-lg border border-default p-8 text-center"
        >
          <UIcon name="i-lucide-package" class="mx-auto size-8 text-muted" aria-hidden="true" />
          <p class="mt-3 text-sm">
            No skills here yet. Search for any npm package above to generate one.
          </p>
        </div>

        <ul
          v-else-if="registryData && view === 'grid'"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
        >
          <li v-for="skill in registryData.items" :key="skill.slug">
            <SkillCard :skill show-owner-path />
          </li>
        </ul>

        <ul
          v-else-if="registryData && view === 'list'"
          class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
        >
          <li v-for="skill in registryData.items" :key="skill.slug">
            <SkillCard :skill variant="list" show-owner-path />
          </li>
        </ul>

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
    </template>

    <!-- Search-mode pagination -->
    <nav
      v-if="isSearching && totalPages > 1"
      aria-label="Pagination"
      class="mx-auto max-w-5xl px-4 sm:px-6 pb-8 flex items-center justify-center gap-2"
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
  </div>
</template>
