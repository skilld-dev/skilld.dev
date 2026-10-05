<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'

const route = useRoute()
const container = useTemplateRef<HTMLElement>('container')
const desktopInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('desktopInput')
const mobileInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('mobileInput')

// The same box behaviour as the homepage hero: one keyboard model, one
// selection rule, one set of destinations.
const {
  query,
  open,
  close,
  openPanel,
  dismiss,
  select,
  onEnter,
  onArrow,
  onColumn,
  gridId,
  activeDescendant,
} = useSkillSearchBox({ inputs: () => [desktopInput.value?.inputRef, mobileInput.value?.inputRef] })

async function openMobile(): Promise<void> {
  openPanel()
  await nextTick()
  mobileInput.value?.inputRef?.focus()
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
</script>

<template>
  <div ref="container" class="relative">
    <!-- Desktop: the field itself is the affordance -->
    <UInput
      id="global-skill-search"
      ref="desktopInput"
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search"
      name="skill-search"
      enterkeyhint="search"
      size="sm"
      autocomplete="off"
      role="combobox"
      aria-label="Search skills or index a GitHub repository"
      aria-haspopup="grid"
      :aria-expanded="open"
      :aria-controls="gridId"
      :aria-activedescendant="activeDescendant"
      class="hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:block"
      :class="open ? 'md:w-72 lg:w-80' : 'md:w-44 lg:w-52'"
      :ui="{ base: 'font-mono' }"
      @focus="openPanel"
      @click="openPanel"
      @keydown.down="onArrow($event, 1)"
      @keydown.up="onArrow($event, -1)"
      @keydown.left="onColumn($event, 0)"
      @keydown.right="onColumn($event, 1)"
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
        class="fixed inset-x-2 top-16 z-50 md:absolute md:inset-x-auto md:top-full md:end-0 md:mt-2 md:w-[min(40rem,calc(100vw-3rem))]"
      >
        <UInput
          ref="mobileInput"
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search skills or repos"
          name="skill-search-mobile"
          enterkeyhint="search"
          size="lg"
          autocomplete="off"
          role="combobox"
          aria-label="Search skills or index a GitHub repository"
          aria-haspopup="grid"
          :aria-expanded="open"
          :aria-controls="gridId"
          :aria-activedescendant="activeDescendant"
          class="mb-2 w-full md:hidden"
          :ui="{ base: 'font-mono' }"
          @keydown.down="onArrow($event, 1)"
          @keydown.up="onArrow($event, -1)"
          @keydown.left="onColumn($event, 0)"
          @keydown.right="onColumn($event, 1)"
          @keydown.enter="onEnter"
        />
        <!-- Lazy: it renders only once search opens, so it stays out of every page's first load. -->
        <LazySkillSearchPanel @select="(row) => { void select(row) }" />
      </div>
    </Transition>

    <!-- Lazy: still mounted after hydration so it can toast a finished index, but from its own chunk. -->
    <ClientOnly>
      <LazySkillSearchRepositoryModal />
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
