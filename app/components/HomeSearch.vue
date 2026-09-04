<script setup lang="ts">
import type { SearchRow } from '../composables/useSkillSearch'
import { onClickOutside, onKeyStroke } from '@vueuse/core'

const route = useRoute()
const {
  query,
  trimmedQuery,
  state,
  open,
  rows,
  activeIndex,
  activeRow,
  move,
  close,
  reset,
  rememberQuery,
  loadTypeaheadIndex,
  submitRepository,
} = useSkillSearch()

const container = useTemplateRef<HTMLElement>('container')
const input = useTemplateRef<{ inputRef?: HTMLInputElement }>('input')

function openPanel(): void {
  open.value = true
  void loadTypeaheadIndex()
}

function dismiss(): void {
  close()
  input.value?.inputRef?.blur()
}

async function goToResults(): Promise<void> {
  const term = trimmedQuery.value
  rememberQuery(term)
  dismiss()
  await navigateTo(term ? { path: '/skills', query: { q: term } } : '/skills')
}

async function select(row: SearchRow): Promise<void> {
  if (row._tag === 'repository') {
    await submitRepository(row.repository)
    return
  }
  if (row._tag === 'all') {
    await goToResults()
    return
  }
  if (state.value._tag !== 'repository')
    rememberQuery(trimmedQuery.value)
  dismiss()
  reset()
  await navigateTo(row.skill.registryPath)
}

function onEnter(event: KeyboardEvent): void {
  event.preventDefault()
  const row = activeRow.value
  if (row) {
    void select(row)
    return
  }
  if (state.value._tag !== 'repository')
    void goToResults()
}

function onArrow(event: KeyboardEvent, delta: number): void {
  if (!open.value) {
    openPanel()
    return
  }
  event.preventDefault()
  move(delta)
}

onClickOutside(container, () => {
  if (open.value)
    close()
})

onKeyStroke('Escape', () => {
  if (open.value)
    dismiss()
})

watch(() => route.fullPath, () => {
  close()
})

const listboxId = computed(() => (open.value && rows.value.length ? 'home-search-listbox' : undefined))
const activeDescendant = computed(() =>
  open.value && rows.value.length ? `skill-search-row-${activeIndex.value}` : undefined,
)
</script>

<template>
  <div ref="container" class="relative">
    <UInput
      id="home-skill-search"
      ref="input"
      v-model="query"
      icon="i-lucide-search"
      placeholder="What should your agent learn today?"
      name="q"
      enterkeyhint="search"
      size="xl"
      autocomplete="off"
      role="combobox"
      aria-label="Search skills or index a GitHub repository"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="activeDescendant"
      class="w-full"
      :ui="{ base: 'font-mono' }"
      @focus="openPanel"
      @keydown.down="onArrow($event, 1)"
      @keydown.up="onArrow($event, -1)"
      @keydown.enter="onEnter"
    >
      <template v-if="!query" #trailing>
        <UKbd value="Enter" class="hidden sm:inline-flex" />
      </template>
    </UInput>

    <Transition name="search-panel">
      <div
        v-if="open"
        class="absolute inset-x-0 top-full z-40 mt-2 md:w-[min(46rem,calc(100vw-3rem))]"
      >
        <SkillSearchPanel @select="(row) => { void select(row) }" />
      </div>
    </Transition>

    <ClientOnly>
      <SkillSearchRepositoryModal />
    </ClientOnly>
  </div>
</template>

<style scoped>
.search-panel-enter-active,
.search-panel-leave-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.search-panel-enter-from,
.search-panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .search-panel-enter-active,
  .search-panel-leave-active {
    transition: opacity 200ms ease-out;
  }

  .search-panel-enter-from,
  .search-panel-leave-to {
    transform: none;
  }
}
</style>
