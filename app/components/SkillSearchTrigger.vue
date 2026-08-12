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
const desktopInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('desktopInput')
const mobileInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('mobileInput')

function openPanel(): void {
  open.value = true
  void loadTypeaheadIndex()
}

async function openMobile(): Promise<void> {
  openPanel()
  await nextTick()
  mobileInput.value?.inputRef?.focus()
}

function dismiss(): void {
  close()
  desktopInput.value?.inputRef?.blur()
  mobileInput.value?.inputRef?.blur()
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
  await navigateTo(repoSkillPath(row.skill.owner, row.skill.repo, row.skill.name))
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

// Escape closes the panel wherever focus sits inside it.
onKeyStroke('Escape', () => {
  if (open.value)
    dismiss()
})

watch(() => route.fullPath, () => {
  close()
})

// Both must be absent while the panel is closed: the listbox is not in the
// DOM then, and ARIA references to missing ids are themselves a violation.
const listboxId = computed(() => (open.value && rows.value.length ? 'skill-search-listbox' : undefined))
const activeDescendant = computed(() =>
  open.value && rows.value.length ? `skill-search-row-${activeIndex.value}` : undefined,
)
</script>

<template>
  <div ref="container" class="relative">
    <!-- Desktop: the field itself is the affordance -->
    <UInput
      id="global-skill-search"
      ref="desktopInput"
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search skills or paste GitHub URL…"
      name="skill-search"
      enterkeyhint="search"
      size="sm"
      autocomplete="off"
      role="combobox"
      aria-label="Search skills or index a GitHub repository"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="activeDescendant"
      class="hidden md:block md:w-56 lg:w-72"
      :ui="{ base: 'font-mono' }"
      @focus="openPanel"
      @keydown.down="onArrow($event, 1)"
      @keydown.up="onArrow($event, -1)"
      @keydown.enter="onEnter"
    >
      <template v-if="!query" #trailing>
        <UKbd value="/" />
      </template>
    </UInput>

    <!-- Mobile: an icon until asked for, so the header stays uncrowded -->
    <UButton
      icon="i-lucide-search"
      color="neutral"
      variant="ghost"
      size="sm"
      class="min-h-11 min-w-11 md:hidden"
      aria-label="Search skills"
      :aria-expanded="open"
      @click="() => { void openMobile() }"
    />

    <Transition name="search-panel">
      <div
        v-if="open"
        class="fixed inset-x-2 top-16 z-50 md:absolute md:inset-x-auto md:top-full md:end-0 md:mt-2 md:w-[min(46rem,calc(100vw-3rem))]"
      >
        <UInput
          ref="mobileInput"
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search skills or paste GitHub URL…"
          name="skill-search-mobile"
          enterkeyhint="search"
          size="lg"
          autocomplete="off"
          aria-label="Search skills or index a GitHub repository"
          class="mb-2 w-full md:hidden"
          :ui="{ base: 'font-mono' }"
          @keydown.down="onArrow($event, 1)"
          @keydown.up="onArrow($event, -1)"
          @keydown.enter="onEnter"
        />
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
