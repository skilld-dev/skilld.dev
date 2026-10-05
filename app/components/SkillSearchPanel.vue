<script setup lang="ts">
import type { SearchRepository, SearchRow, SearchSkill } from '../composables/useSkillSearch'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { searchCellId } from '../composables/useSkillSearch'
import { SEARCH_GRID_ID } from '../composables/useSkillSearchBox'

const emit = defineEmits<{ select: [row: SearchRow] }>()

const {
  query,
  state,
  rows,
  activeIndex,
  activeColumn,
  recentSearches,
  retry,
  submitRepository,
} = useSkillSearch()

/**
 * True when retrieval fell back to meaning alone: the lexical lane matched no
 * skill containing the typed words. Search that always answers with something
 * teaches users not to trust any of its answers.
 */
const isLooseMatch = computed(() =>
  state.value._tag === 'ready' && state.value.mode === 'semantic' && !state.value.repository && rows.value.length > 0,
)

function ownerPath(skill: SearchSkill): string {
  return `${skill.owner}${skill.repo !== 'skills' ? `/${skill.repo}` : ''}`
}

/**
 * Canonical GitHub stars, the evidence the registry ranks on. Zero is omitted
 * rather than rendered, since an unknown count usually means the repo has not
 * been synced yet.
 */
function starsLabel(stars: number | undefined): string | null {
  return stars && stars > 0 ? formatGithubStars(stars) : null
}

function skillCountLabel(repository: SearchRepository): string {
  return `${repository.skillCount} ${repository.skillCount === 1 ? 'skill' : 'skills'}`
}

function rowKey(row: SearchRow): string {
  if (row._tag === 'skill')
    return `skill:${row.skill.owner}/${row.skill.repo}/${row.skill.name}`
  if (row._tag === 'repository' || row._tag === 'index')
    return `${row._tag}:${row.repository.owner}/${row.repository.repo}`
  return 'all'
}

function isActive(index: number, column: 0 | 1): boolean {
  return index === activeIndex.value && activeColumn.value === column
}

function hover(index: number): void {
  if (activeIndex.value !== index) {
    activeIndex.value = index
    activeColumn.value = 0
  }
}

/** A failed avatar collapses to a neutral disc instead of a blank gap. */
function onAvatarError(event: Event): void {
  const image = event.target as HTMLImageElement
  image.removeAttribute('src')
}

function retryRepositoryIndex(): void {
  const current = state.value
  if (current._tag === 'repository')
    void submitRepository(current.repository)
}
</script>

<template>
  <div class="search-panel overflow-hidden rounded-lg border border-default bg-default">
    <div class="search-panel__body overflow-y-auto overscroll-contain">
      <!-- No query: recent searches, so the panel is never a blank box -->
      <template v-if="state._tag === 'empty'">
        <div v-if="recentSearches.length" class="py-2">
          <p class="section-label px-3 pb-1 pt-2">
            Recent searches
          </p>
          <ul class="divide-y divide-default/60">
            <li v-for="term in recentSearches" :key="term">
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left font-mono text-sm text-default transition-colors duration-200 hover:bg-elevated"
                @click="() => { query = term }"
              >
                <UIcon name="i-lucide-clock" class="size-3.5 shrink-0 text-muted" />
                <span class="truncate">{{ term }}</span>
              </button>
            </li>
          </ul>
        </div>
        <p v-else class="px-3 py-6 text-sm text-muted">
          Search by task, skill, owner, or repo. Paste a GitHub URL to see its skills.
        </p>
      </template>

      <!-- Error: scoped retry, same footprint as results -->
      <div v-else-if="state._tag === 'error'" class="px-3 py-6">
        <p class="text-sm text-highlighted">
          Couldn't load matching skills.
        </p>
        <p class="mt-1 text-sm text-muted">
          Check your connection and try this search again.
        </p>
        <UButton
          label="Retry search"
          color="neutral"
          variant="outline"
          size="xs"
          class="mt-3 font-mono"
          @click="() => { void retry() }"
        />
      </div>

      <div
        v-else-if="state._tag === 'repository' && state.status._tag === 'pending'"
        class="px-3 py-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p class="text-sm text-highlighted">
          {{ `Indexing ${state.repository.owner}/${state.repository.repo}…` }}
        </p>
        <p class="mt-1 text-sm text-muted">
          This can take a minute. You can leave search open while the repository is checked.
        </p>
      </div>

      <div
        v-else-if="state._tag === 'repository' && state.status._tag === 'error'"
        class="px-3 py-6"
        role="alert"
      >
        <p class="text-sm text-highlighted">
          Couldn't index this repository.
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ state.status.reason }}
        </p>
        <UButton
          label="Retry indexing"
          color="neutral"
          variant="outline"
          size="xs"
          class="mt-3 min-h-11 font-mono"
          @click="retryRepositoryIndex"
        />
      </div>

      <div
        v-else-if="state._tag === 'repository' && state.status._tag === 'indexed'"
        class="border-b border-default px-3 pb-2 pt-3"
        role="status"
        aria-live="polite"
      >
        <p class="section-label">
          Indexed repository
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ state.status.skills.length }} {{ state.status.skills.length === 1 ? 'skill is' : 'skills are' }} ready to open.
        </p>
      </div>

      <!-- Nothing matched -->
      <div v-else-if="!rows.length && state._tag === 'ready'" class="px-3 py-6">
        <p class="text-sm text-highlighted">
          Nothing matched.
        </p>
        <p class="mt-1 text-sm text-muted">
          Try a broader term, or browse the registry by tag.
        </p>
        <UButton
          to="/skills"
          label="Browse skills"
          color="neutral"
          variant="outline"
          size="xs"
          class="mt-3 font-mono"
        />
      </div>

      <!-- Still waiting, with nothing local to stand in -->
      <div v-else-if="!rows.length" class="px-3 py-6" role="status">
        <p class="text-sm text-muted">
          Searching…
        </p>
      </div>

      <!--
        Nothing contains the typed words, so every row below is a by-meaning
        neighbour. Saying so is the difference between search admitting it
        found no match and quietly presenting its nearest guesses as answers.
      -->
      <div
        v-if="isLooseMatch"
        class="border-b border-default px-3 pb-2 pt-3"
      >
        <p class="section-label">
          Loose matches
        </p>
        <p class="mt-1 text-xs text-muted">
          No skill contains those words. These are the closest by meaning.
        </p>
      </div>

      <!--
        A grid, not a listbox: a Skill row holds a second control, its run
        chip, and an option may not contain one. The combobox points at one
        cell at a time with aria-activedescendant.
      -->
      <div
        v-if="rows.length"
        :id="SEARCH_GRID_ID"
        role="grid"
        :aria-label="state._tag === 'repository' ? 'Repository indexing results' : 'Search results'"
        class="divide-y divide-default/60"
      >
        <div
          v-for="(row, index) in rows"
          :key="rowKey(row)"
          role="row"
          class="search-row"
          :class="{ 'search-row--active': index === activeIndex }"
          @mousemove="hover(index)"
        >
          <div
            :id="searchCellId(index, 0)"
            role="gridcell"
            :aria-selected="isActive(index, 0)"
            class="search-row__open"
            @click="emit('select', row)"
          >
            <template v-if="row._tag === 'skill'">
              <img
                :src="githubAvatarProxyUrl(row.skill.owner, 40)"
                alt=""
                loading="lazy"
                width="20"
                height="20"
                class="search-row__avatar"
                @error="onAvatarError"
              >
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate font-mono text-sm text-highlighted">/{{ row.skill.name }}</span>
                  <UBadge
                    v-if="row.skill.official"
                    label="Official"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="shrink-0 font-mono"
                  />
                  <UBadge
                    v-if="(row.skill.sourceCount ?? 1) > 1"
                    :label="`${row.skill.sourceCount} sources`"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="shrink-0 font-mono @max-md:hidden"
                  />
                </span>
                <span class="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs text-muted">
                  <span class="max-w-[60%] shrink-0 truncate font-mono">{{ ownerPath(row.skill) }}</span>
                  <span v-if="row.skill.description" class="min-w-0 truncate">{{ row.skill.description }}</span>
                </span>
              </span>
              <span v-if="starsLabel(row.skill.stars)" class="search-row__stars data-label">
                <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                {{ starsLabel(row.skill.stars) }}<span class="sr-only"> GitHub stars</span>
              </span>
            </template>

            <template v-else-if="row._tag === 'repository'">
              <img
                :src="githubAvatarProxyUrl(row.repository.owner, 40)"
                alt=""
                loading="lazy"
                width="20"
                height="20"
                class="search-row__avatar"
                @error="onAvatarError"
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-mono text-sm text-highlighted">
                  {{ row.repository.owner }}/{{ row.repository.repo }}
                </span>
                <span class="mt-0.5 block truncate text-xs text-muted">
                  Repository · {{ skillCountLabel(row.repository) }}
                </span>
              </span>
              <span v-if="starsLabel(row.repository.stars)" class="search-row__stars data-label">
                <UIcon name="i-lucide-star" class="size-3" aria-hidden="true" />
                {{ starsLabel(row.repository.stars) }}<span class="sr-only"> GitHub stars</span>
              </span>
              <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            </template>

            <template v-else-if="row._tag === 'index'">
              <UIcon name="i-lucide-github" class="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-mono text-sm text-highlighted">
                  Index {{ row.repository.owner }}/{{ row.repository.repo }}
                </span>
                <span class="mt-0.5 block truncate text-xs text-muted">
                  The registry does not list this repository yet. Index it to add its skills.
                </span>
              </span>
              <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            </template>

            <template v-else>
              <UIcon name="i-lucide-search" class="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate font-mono text-sm">
                See all results for "{{ row.query }}"
              </span>
              <span v-if="state._tag === 'ready'" class="data-label shrink-0">
                {{ state.total }} skills
              </span>
            </template>
          </div>

          <div
            v-if="row._tag === 'skill'"
            :id="searchCellId(index, 1)"
            role="gridcell"
            :aria-selected="isActive(index, 1)"
            class="search-row__run"
            :class="{ 'search-row__run--active': isActive(index, 1) }"
          >
            <RunChip
              :owner="row.skill.owner"
              :repo="row.skill.repo"
              :skill="row.skill.name"
              surface="search-panel"
              variant="compact"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard affordances, stated rather than assumed. Touch has no keys. -->
    <div class="search-panel__keys flex items-center gap-4 whitespace-nowrap border-t border-default px-3 py-2">
      <span class="data-label flex items-center gap-1.5">
        <UKbd value="↑" /><UKbd value="↓" /> navigate
      </span>
      <span class="data-label flex items-center gap-1.5 @max-md:hidden">
        <UKbd value="→" /> run command
      </span>
      <span class="data-label flex items-center gap-1.5">
        <UKbd value="enter" /> open
      </span>
      <span class="data-label ms-auto flex items-center gap-1.5">
        <UKbd value="esc" /> close
      </span>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  /* Borders define this surface, per the design system: no shadow, no blur. */
  container-type: inline-size;
}

/* The panel never runs off the screen; its rows scroll inside it. */
.search-panel__body {
  max-height: min(34rem, calc(100dvh - 12rem));
}

.search-row {
  transition: background-color 200ms ease-out;
}

/* Stone, not rose: every run chip already carries the row's one rose dot. */
.search-row--active {
  background: var(--ui-bg-elevated);
}

.search-row__open {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

.search-row__open[aria-selected='true'] {
  box-shadow: inset 2px 0 0 var(--ui-border-inverted);
}

.search-row__avatar {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--ui-bg-accented);
}

.search-row__stars {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

/* Indented under the Skill name, so the chip reads as that row's command. */
.search-row__run {
  padding: 0 0.75rem 0.625rem calc(0.75rem + 1.25rem + 0.75rem);
  border-radius: var(--ui-radius);
}

.search-row__run--active :deep(.command-chip) {
  outline: 2px solid var(--ui-border-inverted);
  outline-offset: 2px;
}

/* A key hint means nothing on touch. */
@media (pointer: coarse) {
  .search-panel__keys {
    display: none;
  }
}
</style>
