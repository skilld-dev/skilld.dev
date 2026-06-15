<script setup lang="ts">
import type { TagFacet } from '#layers/registry/server/api/skills/tags.get'

useSeoMeta({
  title: 'Skills — skilld',
  description: 'Browse and filter curated skills by tag. Search the registry and combine multiple tags to narrow down what your agent needs.',
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
const tags = ref<string[]>(
  ((route.query.tags as string) || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean),
)
const tagMode = ref<'and' | 'or'>(((route.query.mode as 'and' | 'or') === 'or' ? 'or' : 'and'))
const debouncedSearch = refDebounced(search, 300)

watch([debouncedSearch, page, view, owner, tags, tagMode], async () => {
  const query: Record<string, string> = {}
  if (debouncedSearch.value)
    query.q = debouncedSearch.value
  if (page.value > 1)
    query.page = String(page.value)
  if (view.value !== 'grid')
    query.view = view.value
  if (owner.value)
    query.owner = owner.value
  if (tags.value.length)
    query.tags = tags.value.join(',')
  if (tagMode.value !== 'and')
    query.mode = tagMode.value
  await navigateTo({ query }, { replace: true })
}, { deep: true })

watch([debouncedSearch, tags, owner, tagMode], () => {
  page.value = 1
}, { deep: true })

const PAGE_SIZE = 21
const { isBot } = useBotDetection()

const isFiltering = computed(() =>
  !!debouncedSearch.value || tags.value.length > 0 || !!owner.value,
)
const showFeatured = computed(() => !isFiltering.value)

// Tag facets
const { data: tagFacets } = useFetch('/api/skills/tags', {
  key: 'skills-tag-facets',
  lazy: !isBot.value,
  default: () => ({ tags: [] as TagFacet[], total: 0 }),
})

const tagBySlug = computed(() => {
  const map = new Map<string, TagFacet>()
  for (const t of tagFacets.value?.tags ?? [])
    map.set(t.slug, t)
  return map
})

// Featured (only when nothing is filtered)
const { data: featuredData, status: featuredStatus } = useFetch('/api/skills/featured', {
  key: 'skills-featured-sections',
  query: { orgs: 6, perOrg: 6, devs: 18, perDev: 12 },
  lazy: !isBot.value,
  immediate: showFeatured.value,
})

// Registry list (always; filters when active, candidate-only when not)
const registryQuery = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  sort: 'installs',
  ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
  ...(owner.value ? { owner: owner.value } : {}),
  ...(tags.value.length ? { tags: tags.value.join(','), tagMode: tagMode.value } : {}),
  ...(showFeatured.value ? { trustTier: 'candidate' } : {}),
}))
const { data: registryData, status: registryStatus } = useFetch('/api/skills', {
  query: registryQuery,
  watch: [registryQuery],
  lazy: !isBot.value,
})

const totalPages = computed(() => registryData.value?.pages ?? 1)
const isLoading = computed(() => registryStatus.value === 'pending' && !registryData.value)

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

function toggleTag(slug: string) {
  const next = new Set(tags.value)
  if (next.has(slug))
    next.delete(slug)
  else
    next.add(slug)
  tags.value = [...next]
}

function removeTag(slug: string) {
  tags.value = tags.value.filter(t => t !== slug)
}

function clearAll() {
  search.value = ''
  tags.value = []
  owner.value = ''
}

const tagPopoverOpen = ref(false)
const tagSearch = ref('')
const popularTagCount = 8

const popularTags = computed<TagFacet[]>(() => {
  return (tagFacets.value?.tags ?? [])
    .filter(t => t.count > 0)
    .slice(0, popularTagCount)
})

const filteredTagList = computed<TagFacet[]>(() => {
  const q = tagSearch.value.trim().toLowerCase()
  const list = tagFacets.value?.tags ?? []
  if (!q)
    return list
  return list.filter(
    t => t.label.toLowerCase().includes(q) || t.slug.includes(q),
  )
})

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
        Search the registry by name, owner, or description. Combine tags to narrow down what your agent needs.
      </p>

      <!-- Search + filter row -->
      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative max-w-md flex-1">
          <label for="skill-search" class="sr-only">Search skills</label>
          <UInput
            id="skill-search"
            ref="searchInput"
            v-model="search"
            placeholder="Search by name, owner, or description..."
            icon="i-lucide-search"
            size="lg"
            class="font-mono w-full"
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

        <UPopover v-model:open="tagPopoverOpen" :ui="{ content: 'w-80 p-0' }">
          <UButton
            icon="i-lucide-tags"
            color="neutral"
            :variant="tags.length ? 'subtle' : 'outline'"
            size="md"
            class="font-mono"
          >
            Tags
            <UBadge
              v-if="tags.length"
              :label="String(tags.length)"
              color="primary"
              variant="solid"
              size="xs"
              class="font-mono"
            />
          </UButton>

          <template #content>
            <div class="p-3 border-b border-default">
              <UInput
                v-model="tagSearch"
                placeholder="Filter tags..."
                icon="i-lucide-search"
                size="sm"
                class="font-mono w-full"
              />
            </div>
            <div class="max-h-72 overflow-y-auto py-1">
              <button
                v-for="t in filteredTagList"
                :key="t.slug"
                type="button"
                class="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-elevated transition-colors"
                :class="tags.includes(t.slug) ? 'text-highlighted' : 'text-default'"
                :disabled="t.count === 0 && !tags.includes(t.slug)"
                @click="toggleTag(t.slug)"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <UIcon
                    :name="tags.includes(t.slug) ? 'i-lucide-check-square' : 'i-lucide-square'"
                    class="size-4 shrink-0"
                    :class="tags.includes(t.slug) ? 'text-primary' : 'text-muted'"
                  />
                  <span class="font-mono text-sm truncate">{{ t.label }}</span>
                </span>
                <span class="data-label shrink-0">{{ t.count }}</span>
              </button>
              <p
                v-if="filteredTagList.length === 0"
                class="px-3 py-4 text-center text-xs text-muted"
              >
                No tags match.
              </p>
            </div>
          </template>
        </UPopover>

        <div class="flex items-center gap-2 sm:ml-auto">
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

      <!-- Popular tags chipbar (shown when no tag selected, as discovery) -->
      <div
        v-if="!tags.length && popularTags.length"
        class="mt-4 flex flex-wrap items-center gap-2"
      >
        <span class="data-label uppercase tracking-widest">Popular</span>
        <button
          v-for="t in popularTags"
          :key="t.slug"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-default px-2.5 py-1 font-mono text-xs text-muted hover:text-default hover:border-[var(--ui-text-muted)] transition-colors"
          @click="toggleTag(t.slug)"
        >
          {{ t.label }}
          <span class="text-[10px] opacity-70">{{ t.count }}</span>
        </button>
      </div>

      <!-- Active filter chips (selected tags + owner + AND/OR toggle) -->
      <div
        v-if="isFiltering"
        class="mt-4 flex flex-wrap items-center gap-2"
      >
        <UBadge
          v-if="owner"
          :label="`Owner: ${owner}`"
          variant="subtle"
          color="neutral"
          size="sm"
          class="font-mono"
        >
          <template #trailing>
            <button
              type="button"
              aria-label="Clear owner"
              class="ml-1 -mr-0.5"
              @click="clearOwner"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </template>
        </UBadge>

        <span
          v-for="slug in tags"
          :key="slug"
          class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
        >
          {{ tagBySlug.get(slug)?.label ?? slug }}
          <button
            type="button"
            class="ml-0.5 hover:opacity-100 opacity-70 transition-opacity"
            :aria-label="`Remove ${slug} filter`"
            @click="removeTag(slug)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </span>

        <div v-if="tags.length > 1" class="inline-flex items-center border border-default rounded-full overflow-hidden">
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-xs transition-colors"
            :class="tagMode === 'and' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
            @click="tagMode = 'and'"
          >
            AND
          </button>
          <button
            type="button"
            class="px-2.5 py-1 font-mono text-xs transition-colors"
            :class="tagMode === 'or' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
            @click="tagMode = 'or'"
          >
            OR
          </button>
        </div>

        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          label="Clear all"
          class="ml-auto"
          @click="clearAll"
        />
      </div>
    </section>

    <USeparator />

    <!-- ===== FILTERED MODE: registry results ===== -->
    <section
      v-if="isFiltering"
      class="mx-auto max-w-5xl px-4 sm:px-6 py-8 md:py-12"
      aria-labelledby="results-heading"
    >
      <div class="mb-6 flex items-baseline gap-3 flex-wrap">
        <h2
          id="results-heading"
          class="font-mono text-xl font-medium tracking-tight"
        >
          Results
        </h2>
        <span v-if="registryData" class="data-label">
          {{ registryData.total }} {{ registryData.total === 1 ? 'skill' : 'skills' }}
        </span>
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
        <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" aria-hidden="true" />
        <p class="mt-3 text-sm">
          No skills match these filters. Try removing a tag or broadening your search.
        </p>
        <UButton
          class="mt-4"
          size="sm"
          color="neutral"
          variant="outline"
          label="Clear filters"
          @click="clearAll"
        />
      </div>

      <ul
        v-else-if="view === 'grid'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
      >
        <li v-for="skill in registryData!.items" :key="skill.slug">
          <SkillCard :skill show-tags show-owner-path />
        </li>
      </ul>

      <ul
        v-else
        class="flex flex-col gap-0 list-none p-0 divide-y divide-default border border-default rounded-lg overflow-hidden"
      >
        <li v-for="skill in registryData!.items" :key="skill.slug">
          <SkillCard :skill variant="list" show-tags show-owner-path />
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

    <!-- ===== DEFAULT MODE: Featured ===== -->
    <template v-else>
      <section
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

      <USeparator />

      <section
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
    </template>
  </div>
</template>
