<script setup lang="ts">
import type { TagFacet } from '#layers/registry/server/api/skills/tags.get'

useSeoMeta({
  title: 'Find skills for your AI agent — skilld',
  description: 'Start with the work you need done, then inspect source-backed agent skills from open-source developers and official publishers.',
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
const {
  data: featuredData,
  status: featuredStatus,
  error: featuredError,
  refresh: refreshFeatured,
} = useFetch('/api/skills/featured', {
  key: 'skills-featured-sections',
  query: { orgs: 4, perOrg: 6, devs: 6, perDev: 8 },
  lazy: !isBot.value,
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
const {
  data: registryData,
  status: registryStatus,
  error: registryError,
  refresh: refreshRegistry,
} = useFetch('/api/skills', {
  query: registryQuery,
  watch: [registryQuery],
  lazy: !isBot.value,
  immediate: isFiltering.value,
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
  <div class="overflow-clip">
    <EditorialMasthead
      label="Skill registry"
      title="Find the right skill for the work in front of you."
      description="Start with an outcome, a maintainer you trust, or a precise search. Every result leads back to source you can inspect before you install."
      palette="rose"
      heading-id="skills-heading"
    >
      <template #aside>
        <ol class="editorial-ledger list-none p-0">
          <li class="flex gap-3 py-3">
            <span class="data-label">01</span>
            <span class="text-sm leading-relaxed">Choose the outcome you need.</span>
          </li>
          <li class="flex gap-3 py-3">
            <span class="data-label">02</span>
            <span class="text-sm leading-relaxed">Check the author and source path.</span>
          </li>
          <li class="flex gap-3 py-3">
            <span class="data-label">03</span>
            <span class="text-sm leading-relaxed">Inspect, install, then watch for changes.</span>
          </li>
        </ol>
      </template>

      <!-- Search + filter row -->
      <div class="skills-search-shell">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative flex-1">
            <label for="skill-search" class="sr-only">Search skills</label>
            <UInput
              id="skill-search"
              ref="searchInput"
              v-model="search"
              placeholder="Search a skill, owner, repo, or task…"
              icon="i-lucide-search"
              size="xl"
              class="font-mono w-full [&_input]:min-h-11"
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
                  @click="() => { search = '' }"
                />
              </template>
            </UInput>
          </div>

          <UPopover v-model:open="tagPopoverOpen" :ui="{ content: 'w-80 p-0' }">
            <UButton
              icon="i-lucide-tags"
              color="neutral"
              :variant="tags.length ? 'subtle' : 'outline'"
              size="lg"
              class="min-h-11 font-mono"
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
                  class="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-elevated"
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
                class="grid min-h-11 min-w-11 place-items-center transition-colors duration-200" :class="[
                  view === 'grid' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default',
                ]"
                aria-label="Grid view"
                @click="view = 'grid'"
              >
                <UIcon name="i-lucide-layout-grid" class="size-4" />
              </button>
              <button
                type="button"
                class="grid min-h-11 min-w-11 place-items-center transition-colors duration-200" :class="[
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
            class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-default px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-[var(--ui-text-muted)] hover:text-default"
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
          <span
            v-if="owner"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-default bg-elevated pl-3 pr-1 font-mono text-xs"
          >
            Owner: {{ owner }}
            <button
              type="button"
              aria-label="Clear owner"
              class="grid size-10 place-items-center opacity-70 transition-opacity hover:opacity-100"
              @click="clearOwner"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </span>

          <span
            v-for="slug in tags"
            :key="slug"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 pl-3 pr-1 font-mono text-xs text-primary"
          >
            {{ tagBySlug.get(slug)?.label ?? slug }}
            <button
              type="button"
              class="grid size-10 place-items-center opacity-70 transition-opacity hover:opacity-100"
              :aria-label="`Remove ${slug} filter`"
              @click="removeTag(slug)"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </span>

          <div v-if="tags.length > 1" class="inline-flex min-h-11 items-center overflow-hidden rounded-lg border border-default">
            <button
              type="button"
              class="min-h-11 px-3 py-2 font-mono text-xs transition-colors"
              :class="tagMode === 'and' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
              @click="tagMode = 'and'"
            >
              AND
            </button>
            <button
              type="button"
              class="min-h-11 px-3 py-2 font-mono text-xs transition-colors"
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
            class="ml-auto min-h-11"
            @click="clearAll"
          />
        </div>
      </div>
    </EditorialMasthead>

    <section
      v-if="!isFiltering"
      class="editorial-band border-b border-default bg-muted"
      aria-labelledby="skills-outcomes-heading"
    >
      <div
        class="editorial-atmosphere"
        data-palette="stone"
        data-geometry="wash"
        data-intensity="subtle"
        aria-hidden="true"
      />
      <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-12">
          <div>
            <p class="section-label">
              Start with the work
            </p>
            <h2 id="skills-outcomes-heading" class="skills-section-title mt-4 max-w-[13ch]">
              What should your agent get better at?
            </h2>
            <p id="skills-outcomes-description" class="mt-4 max-w-md text-base leading-relaxed text-muted text-pretty">
              These paths group skills by the job they help with, even when the maintainers and tools differ.
            </p>
          </div>
          <OutcomeClusterGrid aria-describedby="skills-outcomes-description" />
        </div>
      </div>
    </section>

    <USeparator v-else />

    <!-- ===== FILTERED MODE: registry results ===== -->
    <section
      v-if="isFiltering"
      class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="results-heading"
    >
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="section-label">
            Search results
          </p>
          <h2
            id="results-heading"
            class="skills-section-title mt-3"
          >
            Skills that match
          </h2>
        </div>
        <span v-if="registryData" class="data-label pb-1">
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

      <div v-else-if="registryError" role="alert" class="editorial-state">
        <p class="font-medium">
          Couldn't load matching skills.
        </p>
        <p class="mt-1 text-base text-muted">
          Check your connection and try this search again.
        </p>
        <UButton
          label="Retry search"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
          @click="() => refreshRegistry()"
        />
      </div>

      <div
        v-else-if="registryData && registryData.items.length === 0"
        class="editorial-state"
      >
        <p class="font-medium">
          No skills match yet.
        </p>
        <p class="mt-1 text-base text-muted">
          No skills match these filters. Try removing a tag or broadening your search.
        </p>
        <UButton
          class="mt-4 min-h-11"
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
          @click="() => { page-- }"
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
          @click="() => { page++ }"
        />
      </nav>
    </section>

    <!-- ===== DEFAULT MODE: Featured ===== -->
    <template v-else>
      <section
        class="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16"
        aria-labelledby="developers-heading"
      >
        <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="section-label">
              Maintainer-led starting points
            </p>
            <h2 id="developers-heading" class="skills-section-title mt-3 max-w-[17ch]">
              Follow the judgment behind the skill.
            </h2>
            <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
              Start with developers whose work you already trust, then inspect the source and the rest of their stack.
            </p>
          </div>
          <UButton
            to="/skills/official"
            label="Browse official publishers"
            color="neutral"
            variant="ghost"
            trailing-icon="i-lucide-arrow-right"
            class="min-h-11 shrink-0 self-start sm:self-end"
          />
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

        <div v-else-if="featuredError" class="editorial-state" role="alert">
          <p class="font-medium">
            Couldn't load maintainer-led skills.
          </p>
          <p class="mt-1 text-base text-muted">
            Check your connection and try this section again.
          </p>
          <UButton
            label="Retry maintainers"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
            @click="() => refreshFeatured()"
          />
        </div>

        <div v-else-if="featuredData?.devSections.length" class="space-y-0">
          <DeveloperSkillSection
            v-for="section in featuredData.devSections.slice(0, 4)"
            :key="`${section.owner}/${section.repo}`"
            :section
          />
        </div>

        <div v-else class="editorial-state" role="status">
          <p class="font-medium">
            No maintainer-led picks are available yet.
          </p>
          <p class="mt-1 text-base text-muted">
            Search the full registry while this directory is being prepared.
          </p>
        </div>
      </section>

      <section
        v-if="!featuredError"
        class="editorial-band border-t border-default"
        aria-labelledby="official-heading"
      >
        <div
          class="editorial-atmosphere"
          data-palette="ember"
          data-geometry="bloom"
          data-intensity="subtle"
          aria-hidden="true"
        />
        <div class="editorial-band__content mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
          <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="section-label">
                Direct from the source
              </p>
              <h2 id="official-heading" class="skills-section-title mt-3 max-w-[16ch]">
                Skills from the teams building your tools.
              </h2>
              <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
                Use official guidance when the framework, platform, or product itself should define the defaults.
              </p>
            </div>
            <UButton
              to="/skills/official"
              label="View every publisher"
              color="neutral"
              variant="outline"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11 shrink-0 self-start sm:self-end"
            />
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
                <USkeleton v-for="j in 3" :key="j" class="h-32 rounded-lg" />
              </div>
            </div>
          </div>

          <div
            v-else-if="featuredData?.sections.length"
            class="space-y-10"
          >
            <div
              v-for="section in featuredData.sections.slice(0, 3)"
              :key="`${section.owner}/${section.repo}`"
            >
              <div class="mb-4 flex items-center gap-3">
                <NuxtLink
                  :to="ownerHubPath(section.owner)"
                  :aria-label="`${section.owner} profile`"
                  class="shrink-0"
                >
                  <img
                    :src="`https://github.com/${section.owner}.png?size=80`"
                    :alt="`${section.owner} avatar`"
                    width="40"
                    height="40"
                    class="size-10 rounded-full border-2 border-[var(--ui-bg)] bg-muted outline outline-1 outline-[var(--ui-border)]"
                    loading="lazy"
                    decoding="async"
                  >
                </NuxtLink>
                <div class="min-w-0">
                  <h3 class="font-mono text-base font-medium">
                    <NuxtLink
                      :to="ownerHubPath(section.owner)"
                      class="transition-colors hover:text-muted"
                    >
                      {{ section.owner }}
                    </NuxtLink>
                  </h3>
                  <span class="data-label">
                    {{ section.totalSkills }} {{ section.totalSkills === 1 ? 'skill' : 'skills' }} in the registry
                  </span>
                </div>
                <UButton
                  :to="ownerHubPath(section.owner)"
                  label="View source"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  trailing-icon="i-lucide-arrow-up-right"
                  class="ml-auto min-h-11 shrink-0"
                />
              </div>

              <ul
                v-if="view === 'grid'"
                class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0"
              >
                <li v-for="skill in section.skills.slice(0, 3)" :key="skill.slug">
                  <SkillCard :skill show-tags />
                </li>
              </ul>

              <ul
                v-else
                class="editorial-ledger list-none p-0"
              >
                <li v-for="skill in section.skills.slice(0, 3)" :key="skill.slug">
                  <SkillCard :skill variant="list" show-tags />
                </li>
              </ul>
            </div>
          </div>

          <div v-else class="editorial-state" role="status">
            <p class="font-medium">
              No official publishers are available yet.
            </p>
            <p class="mt-1 text-base text-muted">
              Browse maintainer-led skills while official sources are being indexed.
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.skills-search-shell {
  max-width: 52rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: color-mix(in oklab, var(--ui-bg) 82%, transparent);
  padding: 1rem;
}

.skills-section-title {
  font-size: clamp(2.25rem, 1.85rem + 1.8vw, 3.5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}
</style>
