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
const submitDisabled = computed(() => state.value._tag === 'repository' && state.value.status._tag !== 'idle')
const submitLabel = computed(() => (state.value._tag === 'repository' ? 'Index repository' : 'Search'))
</script>

<template>
  <!-- Enter submits, and the trailing key hint becomes the submit control once
       there is a query. Results open over the content below. -->
  <div ref="container" class="home-search relative" @focusout="onFocusOut">
    <form role="search" @submit.prevent="submitQuery">
      <UInput
        id="home-skill-search"
        ref="input"
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search skills or repos"
        name="q"
        enterkeyhint="search"
        size="xl"
        color="neutral"
        autocomplete="off"
        role="combobox"
        aria-label="Search skills or index a GitHub repository"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="activeDescendant"
        class="w-full"
        :ui="{
          base: 'home-search__field h-12 font-mono text-sm sm:text-base focus-visible:ring-1',
          leadingIcon: 'size-4 text-dimmed',
          trailing: 'pe-2',
        }"
        @focus="openPanel"
        @click="openPanel"
        @input="openPanel"
        @keydown.down="onArrow($event, 1)"
        @keydown.up="onArrow($event, -1)"
        @keydown.enter="onEnter"
      >
        <template #trailing>
          <!-- v-show, not v-if: the form keeps its submit button while it is empty. -->
          <button
            v-show="trimmedQuery"
            type="submit"
            class="home-search__submit"
            :aria-label="submitLabel"
            :disabled="submitDisabled"
          >
            <UKbd value="enter" />
          </button>
          <UKbd v-if="!trimmedQuery" value="/" class="home-search__hint" />
        </template>
      </UInput>
    </form>

    <Transition name="home-search-panel">
      <div v-if="open" class="absolute inset-x-0 top-full z-30 mt-2">
        <!-- Lazy, as in SkillSearchTrigger: nothing renders it until search opens. -->
        <LazySkillSearchPanel :show-preview="false" @select="(row) => { void select(row) }" />
      </div>
    </Transition>

    <ClientOnly>
      <LazySkillSearchRepositoryModal />
    </ClientOnly>
  </div>
</template>

<style scoped>
/* Calm field: a plain border, no bevel, and a neutral focus ring instead of a
   second rose element. */
.home-search :deep(.home-search__field) {
  background: var(--ui-bg);
  transition: box-shadow 200ms ease-out;
}

.home-search :deep(.home-search__field:hover:not(:focus-visible)) {
  --tw-ring-color: var(--ui-text-dimmed);
}

.home-search__submit {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding-inline: 0.25rem;
  border-radius: calc(var(--ui-radius) * 0.75);
  cursor: pointer;
  pointer-events: auto;
}

.home-search__submit:focus-visible {
  outline: 2px solid var(--ui-border-inverted);
  outline-offset: 1px;
}

.home-search__submit:disabled {
  cursor: default;
  opacity: 0.5;
}

/* A key hint means nothing on touch. */
@media (pointer: coarse) {
  .home-search__hint {
    display: none;
  }
}

.home-search-panel-enter-active,
.home-search-panel-leave-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.home-search-panel-enter-from,
.home-search-panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .home-search-panel-enter-active,
  .home-search-panel-leave-active {
    transition: opacity 200ms ease-out;
  }

  .home-search-panel-enter-from,
  .home-search-panel-leave-to {
    transform: none;
  }
}
</style>
