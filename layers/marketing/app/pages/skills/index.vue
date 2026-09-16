<script setup lang="ts">
import type { TagFacet } from '#layers/registry/server/api/skills/tags.get'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { trendingSkillKeySet } from '#shared/trending-keys'
import { isInputFocused, resolveRegistryViewState } from '../../utils/registry-view-state'

// "Find skills for your AI agent" matched no query anyone types. The demand is
// on `claude skills directory` (260/mo), `agent skills directory` (90), and the
// library/registry variants, so the title says what this page is in those words.
//
// "Marketplace" is the larger term (3,600/mo) and is deliberately not used:
// nothing here is sold, and claiming a marketplace would misdescribe the
// product. "Best" is likewise avoided as a banned superlative.
//
// The title said "Claude Skills" to hold the head term SEO.md researched. That
// bet drew no impression on any `claude * skills` query in three months, so the
// title now uses the category noun the body copy and brand-guidelines.md
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

watch([debouncedSearch, page, owner, tags, tagMode, sort], async () => {
  const query: Record<string, string> = {}
  if (debouncedSearch.value)
    query.q = debouncedSearch.value
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

watch([debouncedSearch, tags, owner, tagMode, sort], () => {
  page.value = 1
}, { deep: true })

// The table is dense enough to carry a full screen of skills, so the page size
// is sized to the surface rather than to a card grid.
const PAGE_SIZE = 60
const { isBot } = useBotDetection()

const isFiltering = computed(() =>
  !!debouncedSearch.value || tags.value.length > 0 || !!owner.value,
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

// Publishers and maintainers strip (only when nothing is filtered)
const {
  data: featuredData,
  status: featuredStatus,
} = useFetch('/api/skills/featured', {
  key: 'skills-publisher-strip',
  query: { orgs: 6, perOrg: 1, devs: 8, perDev: 1 },
  lazy: !isBot.value,
})

interface PublisherChip {
  owner: string
  totalSkills: number
  official: boolean
}

const publishers = computed<PublisherChip[]>(() => {
  const orgs = (featuredData.value?.sections ?? []).map(section => ({
    owner: section.owner,
    totalSkills: section.totalSkills,
    official: true,
  }))
  const devs = (featuredData.value?.devSections ?? []).map(section => ({
    owner: section.owner,
    totalSkills: section.totalSkills,
    official: false,
  }))
  const seen = new Set<string>()
  return [...orgs, ...devs].filter((entry) => {
    if (seen.has(entry.owner))
      return false
    seen.add(entry.owner)
    return true
  })
})

const registryQuery = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  sort: sort.value,
  ...(showTopSkillPerOwner.value ? { uniqueOwners: true } : {}),
  ...(debouncedSearch.value ? { q: debouncedSearch.value } : {}),
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

function selectOwner(next: string) {
  owner.value = owner.value === next ? '' : next
}
</script>

<template>
  <div class="overflow-clip">
    <CompactPageHeader
      title="Skills"
      description="Search by task, maintainer, package, or tag. Every result opens to the original SKILL.md."
      heading-id="skills-heading"
    />

    <section
      class="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10"
      aria-labelledby="results-heading"
    >
      <!-- Search sits with the results it filters, not in the page header -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <label for="skill-search" class="sr-only">Search skills</label>
          <UInput
            id="skill-search"
            ref="searchInput"
            v-model="search"
            placeholder="Search a skill, owner, repo, or task…"
            icon="i-lucide-search"
            variant="none"
            size="lg"
            class="font-mono w-full border-b border-default [&_input]:min-h-11"
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
            :variant="tags.length ? 'subtle' : 'ghost'"
            size="md"
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
                placeholder="Filter tags…"
                aria-label="Filter tags"
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
      </div>

      <!-- Popular tags chipbar (shown when no tag selected, as discovery) -->
      <div
        v-if="!tags.length && popularTags.length"
        class="mt-4 flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        <span class="data-label shrink-0 uppercase tracking-widest">Popular</span>
        <button
          v-for="t in popularTags"
          :key="t.slug"
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-default px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-[var(--ui-text-muted)] hover:text-default"
          @click="toggleTag(t.slug)"
        >
          {{ t.label }}
          <span class="text-xs tabular-nums">{{ t.count }}</span>
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

      <!-- Publishers and maintainers: a one-line jump into a single owner -->
      <div v-if="!isFiltering" class="mt-6">
        <p id="publishers-label" class="section-label">
          Publishers and maintainers
        </p>
        <div
          v-if="featuredStatus === 'pending' && !featuredData"
          class="mt-3 flex flex-wrap gap-2"
          aria-busy="true"
        >
          <USkeleton v-for="i in 8" :key="i" class="h-11 w-32 rounded-lg" />
        </div>
        <div
          v-else-if="publishers.length"
          class="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
          role="group"
          aria-labelledby="publishers-label"
        >
          <button
            v-for="publisher in publishers"
            :key="publisher.owner"
            type="button"
            class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-default px-3 font-mono text-xs transition-colors hover:border-[var(--ui-text-muted)]"
            :aria-pressed="owner === publisher.owner"
            @click="selectOwner(publisher.owner)"
          >
            <img
              :src="githubAvatarProxyUrl(publisher.owner, 32)"
              alt=""
              width="16"
              height="16"
              class="size-4 rounded-full bg-muted"
              loading="lazy"
              decoding="async"
            >
            <span class="truncate">{{ publisher.owner }}</span>
            <UIcon
              v-if="publisher.official"
              name="i-lucide-badge-check"
              class="size-3 shrink-0 text-muted"
              aria-hidden="true"
            />
            <span class="tabular-nums text-muted">{{ publisher.totalSkills }}</span>
          </button>
        </div>
      </div>

      <div class="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" class="text-base font-semibold tracking-tight">
          <template v-if="isFiltering">
            Matching skills
          </template>
          <template v-else>
            Top skill from each author
          </template>
          <span v-if="registryView._tag === 'ready'" class="data-label ml-2">
            {{ registryView.data.total.toLocaleString() }}
            <template v-if="showTopSkillPerOwner">
              {{ registryView.data.total === 1 ? 'author' : 'authors' }}
            </template>
            <template v-else>
              {{ registryView.data.total === 1 ? 'skill' : 'skills' }}
            </template>
          </span>
        </h2>

        <div class="inline-flex min-h-11 items-center overflow-hidden rounded-lg border border-default">
          <button
            type="button"
            class="min-h-11 px-3 font-mono text-xs transition-colors"
            :class="sort === 'stars' ? 'bg-elevated text-highlighted' : 'text-muted hover:text-default'"
            :aria-pressed="sort === 'stars'"
            @click="sort = 'stars'"
          >
            Stars
          </button>
          <button
            type="button"
            class="min-h-11 px-3 font-mono text-xs transition-colors"
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
  </div>
</template>
