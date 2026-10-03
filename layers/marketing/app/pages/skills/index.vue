<script setup lang="ts">
import type { TagFacet } from '#layers/registry/server/api/skills/tags.get'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { trendingSkillKeySet } from '#shared/trending-keys'
import DirectoryCta from '../../components/skills/_DirectoryCta.vue'
import { isInputFocused, resolveRegistryViewState } from '../../utils/registry-view-state'

// "Find skills for your AI agent" matched no query anyone types. The demand is
// on `claude skills directory` (260/mo), `agent skills directory` (90), and the
// library/registry variants, so the title says what this page is in those words.
//
// "Marketplace" is the larger term (3,600/mo) and is deliberately not used:
// nothing here is sold, and claiming a marketplace would misdescribe the
// product. "Best" is likewise avoided as a banned superlative.
//
// The title said "Claude Skills" to hold the head term the SEO keyword rework researched (docs/work/EXECUTE-seo-keyword-rework.md). That
// bet drew no impression on any `claude * skills` query in three months, so the
// title now uses the category noun the body copy and COPY.md
// already use. The description still names Claude Code, Cursor, and Codex, so
// the principle 6 cross-agent claim survives the rename.
useSeoMeta({
  title: 'Agent Skills Directory',
  description: 'Browse curated agent skills for Claude Code, Cursor, and Codex. Search by task, maintainer, package, or tag. Every skill names its author and links the SKILL.md in their GitHub repo, so you can read it before you install.',
})

defineOgImage('Page.takumi', {
  title: 'Skills',
  description: 'Search the skill registry by task, package, maintainer, or tag.',
}, { alt: 'Skills on skilld' })

const route = useRoute()
const search = ref((route.query.q as string) || '')
const page = ref(Number(route.query.page) || 1)
const owner = ref((route.query.owner as string) || '')
const tags = ref<string[]>(
  ((route.query.tags as string) || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean),
)
const tagMode = ref<'and' | 'or'>(((route.query.mode as 'and' | 'or') === 'or' ? 'or' : 'and'))
// Stars stays the default order; likes only ever order this surface when the
// visitor asks for them in the URL (ADR-0003).
const sort = ref<'stars' | 'likes'>((route.query.sort as string) === 'likes' ? 'likes' : 'stars')
const debouncedSearch = refDebounced(search, 300)
// AI runs only for an explicitly submitted query, not on every keystroke.
const searchIntent = ref<{ _tag: 'keywords' } | { _tag: 'ai', query: string }>(
  route.query.ai === '1' && search.value.trim()
    ? { _tag: 'ai', query: search.value.trim() }
    : { _tag: 'keywords' },
)
const searchQuery = computed(() => searchIntent.value._tag === 'ai' ? searchIntent.value.query : debouncedSearch.value)
watch(search, (value) => {
  if (searchIntent.value._tag === 'ai' && value.trim() !== searchIntent.value.query)
    searchIntent.value = { _tag: 'keywords' }
})
function askAi() {
  const query = search.value.trim()
  if (query)
    searchIntent.value = { _tag: 'ai', query }
}

watch([searchQuery, searchIntent, page, owner, tags, tagMode, sort], async () => {
  const query: Record<string, string> = {}
  if (searchQuery.value)
    query.q = searchQuery.value
  if (searchIntent.value._tag === 'ai')
    query.ai = '1'
  if (page.value > 1)
    query.page = String(page.value)
  if (owner.value)
    query.owner = owner.value
  if (tags.value.length)
    query.tags = tags.value.join(',')
  if (tagMode.value !== 'and')
    query.mode = tagMode.value
  if (sort.value !== 'stars')
    query.sort = sort.value
  await navigateTo({ query }, { replace: true })
}, { deep: true })

watch([searchQuery, searchIntent, tags, owner, tagMode, sort], () => {
  page.value = 1
}, { deep: true })

// Keep the existing pagination contract for the directory.
const PAGE_SIZE = 60
const { isBot } = useBotDetection()

const isFiltering = computed(() =>
  !!searchQuery.value || tags.value.length > 0 || !!owner.value,
)
const showTopSkillPerOwner = computed(() => !isFiltering.value)

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

/**
 * Which of these skills the trending board is carrying right now.
 *
 * Lazy and non-blocking on purpose. A flame is an accent on a browse page, so
 * it must never hold up the registry render or fail it. If the feed is slow or
 * errors, rows draw without flames and nothing else changes.
 *
 * The endpoint caches for 300s, so this costs a shared read rather than a
 * per-visitor query on the site's highest-traffic surface.
 */
const { data: trendingFeed } = useFetch('/api/feed/trending', {
  key: 'skills-trending-flames',
  query: { limit: 30 },
  lazy: true,
  server: false,
  default: () => null,
})

const trendingKeys = computed(
  () => trendingSkillKeySet(trendingFeed.value?.namedSkills ?? []),
)

// Maintainer names come from the featured endpoint's GitHub profiles.
const {
  data: featuredData,
  status: featuredStatus,
} = useFetch('/api/skills/featured', {
  key: 'skills-maintainers',
  query: { orgs: 0, devs: 8, perDev: 1 },
  lazy: !isBot.value,
})

const maintainers = computed(() => {
  const seen = new Set<string>()
  return (featuredData.value?.devSections ?? []).filter((section) => {
    if (seen.has(section.owner))
      return false
    seen.add(section.owner)
    return true
  })
})

const registryQuery = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  sort: sort.value,
  retrieval: searchIntent.value._tag === 'ai' ? 'hybrid' : 'lexical',
  ...(showTopSkillPerOwner.value ? { uniqueOwners: true } : {}),
  ...(searchQuery.value ? { q: searchQuery.value } : {}),
  ...(owner.value ? { owner: owner.value } : {}),
  ...(tags.value.length ? { tags: tags.value.join(','), tagMode: tagMode.value } : {}),
}))
const {
  data: registryData,
  status: registryStatus,
  error: registryError,
  refresh: refreshRegistry,
} = await useFetch('/api/skills', {
  key: 'skills-registry-table',
  query: registryQuery,
  lazy: !isBot.value,
})

const registryView = computed(() => resolveRegistryViewState({
  data: registryData.value,
  error: registryError.value,
  status: registryStatus.value,
}))
const totalPages = computed(() =>
  registryView.value._tag === 'ready' ? registryView.value.data.pages : 1,
)
const isLoading = computed(() => registryView.value._tag === 'loading')

const searchInput = ref<{ inputRef?: HTMLInputElement } | null>(null)
const activeElement = useActiveElement()
const searchFocused = computed(() =>
  isInputFocused(activeElement.value, searchInput.value?.inputRef),
)

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

const filtersOpen = ref(true)
const activeFilterCount = computed(() => tags.value.length + Number(!!owner.value))
const tagSearch = ref('')
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

function selectOwner(next: string) {
  owner.value = owner.value === next ? '' : next
}
</script>

<template>
  <div class="overflow-clip">
    <div class="w-full px-4 pb-8 pt-8 sm:px-6 lg:px-8">
      <header aria-labelledby="skills-heading" class="mx-auto mb-6 max-w-7xl">
        <h1 id="skills-heading" class="text-3xl font-semibold tracking-tight">
          Find Skills
        </h1>
        <p class="mt-2 text-sm text-muted">
          Search by task, maintainer, package, or tag. Every result opens to the original SKILL.md.
        </p>
      </header>

      <section aria-labelledby="results-heading">
        <div class="mx-auto max-w-7xl">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1 sm:max-w-lg">
              <label for="skill-search" class="sr-only">Search skills</label>
              <UInput
                id="skill-search"
                ref="searchInput"
                v-model="search"
                placeholder="Search a skill, owner, repo, or task…"
                icon="i-lucide-search"
                variant="outline"
                size="md"
                class="w-full font-mono [&_input]:min-h-11 sm:[&_input]:min-h-9"
                :loading="isLoading"
              >
                <template #trailing>
                  <UKbd v-if="!search && !searchFocused" value="/" size="sm" />
                  <UButton
                    v-else-if="search"
                    icon="i-lucide-x"
                    color="neutral"
                    variant="link"
                    size="xs"
                    class="size-11 justify-center sm:size-8"
                    aria-label="Clear search"
                    @click="search = ''"
                  />
                </template>
              </UInput>
            </div>
            <UButton
              icon="i-lucide-sliders-horizontal"
              color="neutral"
              :variant="filtersOpen ? 'subtle' : 'ghost'"
              size="sm"
              class="min-h-11 shrink-0 font-mono sm:min-h-9"
              :aria-expanded="filtersOpen"
              aria-controls="skills-filters"
              @click="filtersOpen = !filtersOpen"
            >
              Filters<span v-if="activeFilterCount" class="text-muted">({{ activeFilterCount }})</span>
            </UButton>
          </div>

          <div v-if="search.trim()" class="mt-1">
            <UButton
              v-if="searchIntent._tag === 'keywords'"
              icon="i-lucide-sparkles"
              color="neutral"
              variant="ghost"
              size="xs"
              class="min-h-11 max-w-full justify-start font-mono sm:min-h-8"
              @click="askAi"
            >
              <span class="truncate">Ask AI: “{{ search.trim() }}”</span>
            </UButton>
            <div v-else class="flex items-center gap-3 font-mono text-xs text-muted">
              <span class="inline-flex items-center gap-1.5"><UIcon name="i-lucide-sparkles" class="size-3.5" />AI search</span>
              <button type="button" class="min-h-11 underline underline-offset-2 hover:text-default sm:min-h-8" @click="searchIntent = { _tag: 'keywords' }">
                Search by keywords
              </button>
            </div>
          </div>

          <div v-if="isFiltering" class="mt-2 flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted">
            <button v-if="owner" type="button" class="inline-flex min-h-11 items-center gap-1 hover:text-default sm:min-h-7" aria-label="Clear owner" @click="clearOwner">
              {{ owner }} <UIcon name="i-lucide-x" class="size-3" />
            </button>
            <button v-for="slug in tags" :key="slug" type="button" class="inline-flex min-h-11 items-center gap-1 hover:text-default sm:min-h-7" :aria-label="`Remove ${slug} filter`" @click="removeTag(slug)">
              {{ tagBySlug.get(slug)?.label ?? slug }} <UIcon name="i-lucide-x" class="size-3" />
            </button>
            <button type="button" class="min-h-11 underline underline-offset-2 hover:text-default sm:min-h-7" @click="clearAll">
              Clear all
            </button>
          </div>
        </div>

        <div class="mt-5 grid items-start gap-6" :class="filtersOpen ? 'lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_15rem]' : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem]'">
          <aside v-show="filtersOpen" id="skills-filters" aria-label="Filters" class="min-w-0 border-b border-default pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
            <div class="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-6">
              <div class="min-w-0">
                <h2 id="tags-label" class="mb-3 flex min-h-7 items-center text-sm font-semibold text-default">
                  Tags
                </h2>
                <UInput v-model="tagSearch" placeholder="Filter tags…" aria-label="Filter tags" icon="i-lucide-search" size="sm" class="w-full font-mono [&_input]:min-h-11 sm:[&_input]:min-h-8" />
                <div v-if="tags.length > 1" class="mt-2 flex items-center gap-1 font-mono text-xs" role="group" aria-label="Tag matching">
                  <button v-for="mode in (['and', 'or'] as const)" :key="mode" type="button" class="min-h-11 rounded px-3 sm:min-h-7" :class="tagMode === mode ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'" :aria-pressed="tagMode === mode" @click="tagMode = mode">
                    {{ mode.toUpperCase() }}
                  </button>
                </div>
                <div class="mt-2 max-h-44 sm:max-h-48 overflow-y-auto" role="group" aria-labelledby="tags-label">
                  <button v-for="t in filteredTagList" :key="t.slug" type="button" class="flex min-h-11 w-full items-center gap-2 rounded px-1 text-left font-mono text-xs hover:bg-elevated sm:min-h-8" :aria-pressed="tags.includes(t.slug)" :disabled="t.count === 0 && !tags.includes(t.slug)" @click="toggleTag(t.slug)">
                    <UIcon :name="tags.includes(t.slug) ? 'i-lucide-check-square' : 'i-lucide-square'" class="size-3.5 shrink-0" :class="tags.includes(t.slug) ? 'text-primary' : 'text-dimmed'" />
                    <span class="truncate">{{ t.label }}</span>
                    <span class="ml-auto text-dimmed tabular-nums">{{ t.count }}</span>
                  </button>
                  <p v-if="!filteredTagList.length" class="py-3 text-xs text-muted">
                    No tags match.
                  </p>
                </div>
              </div>
              <div class="min-w-0">
                <h2 id="maintainers-label" class="mb-2 flex min-h-7 items-center text-sm font-semibold text-default">
                  Maintainers
                </h2>
                <div v-if="featuredStatus === 'pending' && !featuredData" aria-busy="true" class="space-y-2">
                  <USkeleton v-for="i in 8" :key="i" class="h-8 w-full rounded" />
                </div>
                <div v-else-if="maintainers.length" class="max-h-60 overflow-y-auto lg:max-h-none lg:overflow-visible" role="group" aria-labelledby="maintainers-label">
                  <button
                    v-for="maintainer in maintainers"
                    :key="maintainer.owner"
                    type="button"
                    class="flex min-h-11 w-full items-center gap-2 rounded px-1 py-1.5 text-left transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                    :class="owner === maintainer.owner ? 'bg-elevated text-highlighted' : 'text-toned'"
                    :aria-pressed="owner === maintainer.owner"
                    @click="selectOwner(maintainer.owner)"
                  >
                    <img :src="githubAvatarProxyUrl(maintainer.owner, 48)" alt="" width="24" height="24" class="size-6 shrink-0 rounded-full bg-muted" loading="lazy" decoding="async">
                    <span class="min-w-0">
                      <span class="block truncate text-[13px] font-medium leading-5">{{ maintainer.displayName }}</span>
                      <span v-if="maintainer.displayName !== maintainer.owner" class="block truncate font-mono text-[11px] leading-4 text-muted">@{{ maintainer.owner }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <div class="min-w-0">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h2 id="results-heading" class="min-w-0 text-sm font-semibold text-default">
                <template v-if="isFiltering">
                  Matching skills
                </template>
                <template v-else>
                  Top skill from each author
                </template>
                <span v-if="registryView._tag === 'ready'" class="data-label mt-1 block font-normal sm:ml-2 sm:mt-0 sm:inline">
                  {{ registryView.data.total.toLocaleString() }}
                  <template v-if="showTopSkillPerOwner">
                    {{ registryView.data.total === 1 ? 'author' : 'authors' }}
                  </template>
                  <template v-else>
                    {{ registryView.data.total === 1 ? 'skill' : 'skills' }}
                  </template>
                </span>
              </h2>

              <div class="inline-flex shrink-0 items-center gap-1 font-mono text-xs">
                <button
                  type="button"
                  class="min-h-11 rounded px-2 font-mono text-xs transition-colors sm:min-h-7"
                  :class="sort === 'stars' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
                  :aria-pressed="sort === 'stars'"
                  @click="sort = 'stars'"
                >
                  Stars
                </button>
                <button
                  type="button"
                  class="min-h-11 rounded px-2 font-mono text-xs transition-colors sm:min-h-7"
                  :class="sort === 'likes' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
                  :aria-pressed="sort === 'likes'"
                  @click="sort = 'likes'"
                >
                  Likes
                </button>
              </div>
            </div>

            <div aria-live="polite" aria-atomic="true" class="sr-only">
              <template v-if="isLoading">
                Loading skills…
              </template>
              <template v-else-if="registryView._tag === 'ready' && registryView.data.items.length === 0">
                No skills found.
              </template>
              <template v-else-if="registryView._tag === 'ready'">
                {{ registryView.data.total }} skills.
              </template>
            </div>

            <div
              v-if="isLoading"
              class="flex flex-col gap-px rounded-lg border border-default p-2"
              aria-busy="true"
              aria-label="Loading skills"
            >
              <div v-for="i in 20" :key="i" data-loading-skill class="flex items-center gap-3 px-1 py-2">
                <USkeleton class="size-4 shrink-0 rounded-full" />
                <USkeleton class="h-3 w-40" />
                <USkeleton class="h-3 w-32" />
                <USkeleton class="hidden h-3 flex-1 md:block" />
              </div>
            </div>

            <div v-else-if="registryView._tag === 'error'" role="alert" class="editorial-state">
              <p class="font-medium">
                Couldn't load skills.
              </p>
              <p class="mt-1 text-base text-muted">
                Check your connection and try again.
              </p>
              <UButton
                label="Retry"
                color="neutral"
                variant="outline"
                class="mt-4 min-h-11"
                @click="() => refreshRegistry()"
              />
            </div>

            <div
              v-else-if="registryView._tag === 'ready' && registryView.data.items.length === 0"
              class="editorial-state"
            >
              <p class="font-medium">
                Nothing matched.
              </p>
              <p class="mt-1 text-base text-muted">
                Remove a tag or try a broader search.
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

            <SkillTable
              v-else-if="registryView._tag === 'ready'"
              :skills="registryView.data.items"
              :metric="sort"
              :trending-keys="trendingKeys"
              class="directory-table"
              :aria-label="isFiltering ? 'Matching skills' : 'Top skill from each author'"
            />

            <nav
              v-if="totalPages > 1"
              aria-label="Pagination"
              class="mt-6 flex items-center justify-center gap-2"
            >
              <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="ghost"
                size="sm"
                class="size-11 justify-center"
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
                class="size-11 justify-center"
                aria-label="Next page"
                :disabled="page >= totalPages"
                @click="() => { page++ }"
              />
            </nav>
          </div>
          <aside class="min-w-0 xl:sticky xl:top-24" aria-label="More from skilld">
            <DirectoryCta />
          </aside>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Give identity more room than the summary in this directory's wide layout. */
@media (min-width: 64rem) {
  .directory-table :deep(.skill-table__head),
  .directory-table :deep(.skill-table__row) {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr) minmax(0, 1.6fr) 3.5rem 3.5rem;
    gap: 0.75rem;
  }
}
</style>
