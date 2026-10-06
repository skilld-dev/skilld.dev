<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'

const route = useRoute()
const container = useTemplateRef<HTMLElement>('container')
const input = useTemplateRef<{ inputRef?: HTMLInputElement }>('input')

// Behaviour lives in the shared box composable, so the hero and the header
// search answer, select, and navigate the same way.
const {
  query,
  trimmedQuery,
  state,
  open,
  close,
  openPanel,
  dismiss,
  select,
  submitQuery,
  onEnter,
  onArrow,
  onColumn,
  gridId,
  activeDescendant,
} = useSkillSearchBox({ inputs: () => [input.value?.inputRef] })

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
        aria-haspopup="grid"
        :aria-expanded="open"
        :aria-controls="gridId"
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
        @keydown.left="onColumn($event, 0)"
        @keydown.right="onColumn($event, 1)"
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
        <LazySkillSearchPanel @select="(row) => { void select(row) }" />
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
