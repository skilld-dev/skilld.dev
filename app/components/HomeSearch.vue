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
  close,
  reset,
  rememberQuery,
  loadTypeaheadIndex,
  submitRepository,
} = useSkillSearch()

const container = useTemplateRef<HTMLElement>('container')
const input = useTemplateRef<{ inputRef?: HTMLInputElement }>('input')
const keyboardSelection = ref(false)

function clearSelection(): void {
  keyboardSelection.value = false
  activeIndex.value = -1
}

watch([trimmedQuery, rows], clearSelection, { flush: 'sync', immediate: true })
watch(open, (visible) => {
  if (!visible)
    clearSelection()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  activeIndex.value = 0
})

function openPanel(): void {
  if (!open.value)
    clearSelection()
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

function submitQuery(): void {
  if (state.value._tag === 'repository') {
    if (state.value.status._tag === 'idle')
      void submitRepository(state.value.repository)
    return
  }
  void goToResults()
}

function onEnter(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229)
    return
  event.preventDefault()
  if (open.value && keyboardSelection.value && activeRow.value) {
    void select(activeRow.value)
    return
  }
  submitQuery()
}

function onArrow(event: KeyboardEvent, delta: number): void {
  if (event.isComposing || event.keyCode === 229)
    return
  event.preventDefault()
  openPanel()
  const count = rows.value.length
  if (!count)
    return
  activeIndex.value = keyboardSelection.value
    ? (activeIndex.value + delta + count) % count
    : delta > 0 ? 0 : count - 1
  keyboardSelection.value = true
}

function onFocusOut(event: FocusEvent): void {
  if (!container.value?.contains(event.relatedTarget as Node | null))
    close()
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

const listboxId = computed(() => (open.value && rows.value.length ? 'skill-search-listbox' : undefined))
const activeDescendant = computed(() =>
  open.value && keyboardSelection.value && activeRow.value ? `skill-search-row-${activeIndex.value}` : undefined,
)
</script>

<template>
  <div ref="container" @focusout="onFocusOut">
    <form role="search" class="flex items-stretch gap-2" @submit.prevent="submitQuery">
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
        class="min-w-0 flex-1"
        :ui="{ base: 'min-h-11 font-mono' }"
        @focus="openPanel"
        @click="openPanel"
        @input="openPanel"
        @keydown.down="onArrow($event, 1)"
        @keydown.up="onArrow($event, -1)"
        @keydown.enter="onEnter"
      />
      <UButton
        type="submit"
        size="xl"
        class="min-h-11 shrink-0 justify-center font-mono"
        :disabled="state._tag === 'repository' && state.status._tag !== 'idle'"
      >
        {{ state._tag === 'repository' ? 'Index repository' : 'Search' }}
      </UButton>
    </form>

    <div v-if="open" class="mt-2">
      <!-- Lazy, as in SkillSearchTrigger: nothing renders it until search opens. -->
      <LazySkillSearchPanel :show-preview="false" @select="(row) => { void select(row) }" />
    </div>

    <ClientOnly>
      <LazySkillSearchRepositoryModal />
    </ClientOnly>
  </div>
</template>
