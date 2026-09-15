<script setup lang="ts">
import type { SearchRow, SearchSkill } from '../composables/useSkillSearch'
import { skillRunCmd } from '#shared/skill-commands'

const { showPreview = true } = defineProps<{ showPreview?: boolean }>()

const emit = defineEmits<{ select: [row: SearchRow] }>()

const {
  query,
  state,
  rows,
  activeIndex,
  activeRow,
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
  state.value._tag === 'ready' && state.value.mode === 'semantic' && rows.value.length > 0,
)

const previewSkill = computed<SearchSkill | null>(() => {
  const row = activeRow.value
  if (row?._tag === 'skill')
    return row.skill
  const first = rows.value.find(r => r._tag === 'skill')
  return first?._tag === 'skill' ? first.skill : null
})

// One skill is previewed, so this surface speaks the v3 run grammar.
const previewRunCmd = computed(() =>
  previewSkill.value
    ? skillRunCmd(previewSkill.value.owner, previewSkill.value.repo, previewSkill.value.name)
    : '',
)
const { copy: copyRun, copied: runCopied } = useInstallCopy(
  previewRunCmd,
  'search-panel',
  'run',
  () => ({
    kind: 'skill',
    owner: previewSkill.value?.owner ?? '',
    name: previewSkill.value?.name ?? '',
  }),
)

function ownerPath(skill: SearchSkill): string {
  return `${skill.owner}${skill.repo !== 'skills' ? `/${skill.repo}` : ''}`
}

/**
 * One labelled signal per row: canonical GitHub stars, the evidence the
 * registry ranks on. Zero is omitted rather than rendered, since an unknown
 * count usually means the repo has not been synced yet.
 */
function signalLabel(skill: SearchSkill): string | null {
  const stars = skill.stars ?? 0
  return stars > 0 ? `${formatGithubStars(stars)} GitHub stars` : null
}

function timestampFor(skill: SearchSkill): Date | null {
  const seconds = skill.modifiedAt ?? skill.pushedAt
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

function retryRepositoryIndex(): void {
  const current = state.value
  if (current._tag === 'repository')
    void submitRepository(current.repository)
}
</script>

<template>
  <div
    class="search-panel overflow-hidden rounded-lg border border-default bg-default"
  >
    <div class="flex flex-col xl:flex-row xl:items-stretch">
      <!-- Results -->
      <div class="min-w-0 flex-1" :class="{ 'xl:border-e xl:border-default': showPreview }">
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
                  @click="query = term"
                >
                  <UIcon name="i-lucide-clock" class="size-3.5 shrink-0 text-muted" />
                  <span class="truncate">{{ term }}</span>
                </button>
              </li>
            </ul>
          </div>
          <p v-else class="px-3 py-6 text-sm text-muted">
            Search by skill, owner, repo, or the task you want your agent to handle.
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
        <div v-else-if="!rows.length" class="px-3 py-6">
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

        <ul
          v-if="rows.length"
          id="skill-search-listbox"
          role="listbox"
          :aria-label="state._tag === 'repository' ? 'Repository indexing results' : 'Skill search results'"
          class="divide-y divide-default/60"
        >
          <li v-for="(row, index) in rows" :key="row._tag === 'skill' ? `${row.skill.owner}/${row.skill.repo}/${row.skill.name}` : 'all'" role="presentation">
            <button
              :id="`skill-search-row-${index}`"
              type="button" class="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-200"
              :class="[
                index === activeIndex ? 'bg-primary/10 text-primary' : 'hover:bg-elevated',
              ]"
              :aria-selected="index === activeIndex"
              role="option"
              @mousemove="activeIndex = index"
              @click="emit('select', row)"
            >
              <template v-if="row._tag === 'skill'">
                <img
                  :src="`https://github.com/${row.skill.owner}.png?size=40`"
                  :alt="`${row.skill.owner} avatar`"
                  loading="lazy"
                  width="20"
                  height="20"
                  class="size-5 shrink-0 rounded-full"
                >
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
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
                      class="shrink-0 font-mono"
                    />
                  </span>
                  <span class="mt-0.5 flex items-baseline gap-1.5">
                    <span class="shrink-0 font-mono text-xs text-muted">{{ ownerPath(row.skill) }}</span>
                    <span v-if="row.skill.description" class="truncate text-xs text-muted">
                      {{ row.skill.description }}
                    </span>
                  </span>
                </span>
                <span
                  v-if="signalLabel(row.skill)"
                  class="data-label shrink-0 whitespace-nowrap"
                >{{ signalLabel(row.skill) }}</span>
              </template>

              <template v-else-if="row._tag === 'repository'">
                <UIcon name="i-lucide-github" class="size-4 shrink-0 text-muted" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-mono text-sm text-highlighted">
                    Index {{ row.repository.owner }}/{{ row.repository.repo }}
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-muted">
                    Add its skills to search if the repository has not been indexed.
                  </span>
                </span>
                <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" />
              </template>

              <template v-else>
                <UIcon name="i-lucide-search" class="size-3.5 shrink-0 text-muted" />
                <span class="truncate font-mono text-sm">
                  See all results for "{{ row.query }}"
                </span>
                <span v-if="state._tag === 'ready'" class="data-label ms-auto shrink-0">
                  {{ state.total }} skills
                </span>
              </template>
            </button>
          </li>
        </ul>
      </div>

      <!-- Preview: the highlighted skill, with its run command ready -->
      <aside
        v-if="showPreview && previewSkill"
        class="hidden w-80 shrink-0 flex-col p-4 xl:flex"
      >
        <p class="section-label">
          Preview
        </p>
        <p class="mt-2 truncate font-mono text-sm text-highlighted">
          /{{ previewSkill.name }}
        </p>
        <NuxtLink
          :to="ownerHubPath(previewSkill.owner)"
          class="mt-1 flex items-center gap-2 font-mono text-xs text-muted transition-colors duration-200 hover:text-default"
        >
          <img
            :src="`https://github.com/${previewSkill.owner}.png?size=32`"
            :alt="`${previewSkill.owner} avatar`"
            loading="lazy"
            width="16"
            height="16"
            class="size-4 rounded-full"
          >
          {{ ownerPath(previewSkill) }}
        </NuxtLink>

        <p v-if="previewSkill.description" class="mt-3 line-clamp-5 text-xs text-muted">
          {{ previewSkill.description }}
        </p>

        <dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <div v-if="signalLabel(previewSkill)">
            <dt class="sr-only">
              GitHub stars
            </dt>
            <dd class="data-label">
              {{ signalLabel(previewSkill) }}
            </dd>
          </div>
          <div v-if="timestampFor(previewSkill)">
            <dt class="sr-only">
              Last updated
            </dt>
            <dd class="data-label">
              Updated <NuxtTime :datetime="timestampFor(previewSkill)!" relative />
            </dd>
          </div>
        </dl>

        <div v-if="(previewSkill.sourceCount ?? 1) > 1" class="mt-3">
          <p class="section-label">
            Also in
          </p>
          <ul class="mt-1 space-y-0.5">
            <li
              v-for="source in previewSkill.alternateSources ?? []"
              :key="source.slug"
              class="truncate font-mono text-xs text-muted"
            >
              {{ source.owner }}/{{ source.repo }}
            </li>
          </ul>
        </div>

        <div class="mt-auto pt-4">
          <UButton
            :label="runCopied ? 'Copied' : 'Copy run'"
            :aria-label="runCopied ? 'Copied' : 'Copy run command'"
            :icon="runCopied ? 'i-lucide-check' : 'i-lucide-clipboard'"
            color="neutral"
            variant="outline"
            size="xs"
            block
            class="font-mono"
            @click="() => { void copyRun() }"
          />
        </div>
      </aside>
    </div>

    <!-- Keyboard affordances, stated rather than assumed -->
    <div class="flex items-center gap-4 border-t border-default px-3 py-2">
      <span class="data-label flex items-center gap-1.5">
        <UKbd value="↑" /><UKbd value="↓" /> navigate
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
</style>
