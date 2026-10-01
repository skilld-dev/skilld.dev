<script setup lang="ts">
import type { SkillSourceItem } from '../types/skill-source'
import {
  useActiveElement,
  useElementHover,
  useElementVisibility,
  useFocusWithin,
  usePreferredReducedMotion,
  useRafFn,
  useTimeoutFn,
} from '@vueuse/core'
import { githubAvatarProxyUrl } from '#shared/image-proxy'

const {
  items,
  variant = 'grid',
  autoScroll = false,
  ariaLabel = 'Skills',
} = defineProps<{
  items: readonly SkillSourceItem[]
  variant?: 'stream' | 'grid'
  autoScroll?: boolean
  ariaLabel?: string
}>()

const viewport = useTemplateRef<HTMLElement>('viewport')
const isHovered = useElementHover(viewport)
const { focused: hasFocusWithin } = useFocusWithin(viewport)
const activeElement = useActiveElement()
const reducedMotion = usePreferredReducedMotion()
const manuallyPaused = ref(false)
const scrollDirection = ref<1 | -1>(1)
const renderedItems = shallowRef<readonly SkillSourceItem[]>(items)
const pendingItems = shallowRef<readonly SkillSourceItem[] | null>(null)
const hasFocusedItem = computed(() =>
  hasFocusWithin.value
  && activeElement.value?.matches('a.skill-source-stream__item') === true,
)

const { start: queueResume, stop: cancelResume } = useTimeoutFn(() => {
  manuallyPaused.value = false
}, 3000, { immediate: false })

function pauseForManualInput() {
  manuallyPaused.value = true
  cancelResume()
  queueResume()
}

watch(() => items, (nextItems) => {
  if (variant === 'stream' && hasFocusedItem.value) {
    pendingItems.value = nextItems
    return
  }

  renderedItems.value = nextItems
  pendingItems.value = null
})

watch(hasFocusedItem, (focused) => {
  if (focused || !pendingItems.value)
    return

  renderedItems.value = pendingItems.value
  pendingItems.value = null
})

const isOnScreen = useElementVisibility(viewport)
// The scroll writes layout on every frame, so it waits until the page has
// hydrated and idles, and stops whenever nobody can see it.
const pageReady = ref(false)
onNuxtReady(() => {
  pageReady.value = true
})
const scrolling = computed(() =>
  variant === 'stream'
  && autoScroll
  && pageReady.value
  && isOnScreen.value
  && !isHovered.value
  && !hasFocusedItem.value
  && !manuallyPaused.value
  && reducedMotion.value !== 'reduce',
)

const { pause, resume } = useRafFn(({ delta }) => {
  const element = viewport.value
  if (!element)
    return

  const maxScroll = element.scrollHeight - element.clientHeight
  if (maxScroll <= 0)
    return

  if (element.scrollTop >= maxScroll - 1)
    scrollDirection.value = -1
  else if (element.scrollTop <= 1)
    scrollDirection.value = 1

  const distance = Math.min(delta, 64) * 0.018 * scrollDirection.value
  element.scrollTop = Math.min(maxScroll, Math.max(0, element.scrollTop + distance))
}, { fpsLimit: 30, immediate: false })

watch(scrolling, run => run ? resume() : pause(), { immediate: true })

function itemKey(item: SkillSourceItem): string {
  return `${item.owner}/${item.repo}/${item.name}`
}

function sourcePath(item: SkillSourceItem): string {
  return `${item.owner}/${item.repo}`
}
</script>

<template>
  <div
    v-if="variant === 'stream'"
    ref="viewport"
    class="skill-source-stream"
    data-testid="skill-source-stream"
    @pointerdown="pauseForManualInput"
    @keydown="pauseForManualInput"
  >
    <ul
      class="skill-source-stream__list list-none p-0"
      :aria-label="ariaLabel"
    >
      <li v-for="(item, index) in renderedItems" :key="itemKey(item)">
        <NuxtLink
          :to="item.registryPath"
          :aria-label="`${item.displayName} by ${item.maintainerName || item.owner}`"
          class="skill-source-stream__item group"
        >
          <span class="skill-source-stream__avatar">
            <img
              :src="githubAvatarProxyUrl(item.owner, 96)"
              alt=""
              width="32"
              height="32"
              class="size-8 rounded-full border-2 border-[var(--ui-bg)] bg-default"
              :loading="index < 5 ? 'eager' : 'lazy'"
              decoding="async"
            >
          </span>
          <span class="skill-source-stream__card">
            <span class="flex min-w-0 items-center justify-between gap-3">
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold tracking-tight text-default">
                  {{ item.displayName }}
                </span>
                <span class="mt-0.5 block truncate font-mono text-xs text-muted">
                  {{ item.maintainerName || item.owner }} · {{ sourcePath(item) }}<template v-if="item.context"> · {{ item.context }}</template>
                </span>
              </span>
              <UIcon
                name="i-lucide-arrow-up-right"
                class="skill-source-stream__arrow size-4 shrink-0 text-muted"
                aria-hidden="true"
              />
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>

  <ul
    v-else
    class="skill-source-grid list-none p-0"
    :aria-label="ariaLabel"
  >
    <li v-for="item in renderedItems" :key="itemKey(item)">
      <NuxtLink
        :to="item.registryPath"
        :aria-label="`${item.displayName} by ${item.maintainerName || item.owner}`"
        class="skill-source-grid__item group"
      >
        <img
          :src="githubAvatarProxyUrl(item.owner, 48)"
          alt=""
          width="24"
          height="24"
          class="mt-0.5 size-6 shrink-0 rounded-md border border-default"
          loading="lazy"
          decoding="async"
        >
        <span class="min-w-0 flex-1">
          <span class="block truncate font-mono text-sm">
            /{{ item.name }}
          </span>
          <span class="data-label mt-0.5 block truncate">
            {{ sourcePath(item) }}
          </span>
          <span
            v-if="item.description"
            class="mt-2 line-clamp-2 text-sm text-muted"
          >
            {{ item.description }}
          </span>
        </span>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.skill-source-stream {
  position: relative;
  block-size: 30rem;
  min-inline-size: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-block: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  contain: layout style paint;
  mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%);
}

.skill-source-stream:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.skill-source-stream__list {
  position: relative;
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.5rem;
  padding-block: 1.75rem;
}

.skill-source-stream__list::before {
  position: absolute;
  inset-block: 1.75rem;
  inset-inline-start: 1.125rem;
  inline-size: 1px;
  background: var(--ui-border);
  content: "";
}

/* Rows stay compact so the rail reads as a deep list, not five samples. */
.skill-source-stream__item {
  position: relative;
  display: grid;
  min-block-size: 2.875rem;
  min-inline-size: 0;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
}

.skill-source-stream__item::before {
  position: absolute;
  inset-inline-start: 2.25rem;
  inline-size: 0.75rem;
  block-size: 1px;
  background: var(--ui-border);
  content: "";
}

.skill-source-stream__avatar {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-bg);
}

.skill-source-stream__card {
  display: block;
  min-inline-size: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: color-mix(in oklch, var(--ui-bg) 94%, transparent);
  padding: 0.5rem 0.75rem;
  transition: border-color 200ms ease-out;
}

.skill-source-stream__arrow {
  translate: 0;
  transition: color 200ms ease-out, translate 200ms ease-out;
}

.skill-source-grid {
  display: grid;
  /* minmax(0) stops the truncated names from sizing the track to their full
     length, which pushed cards past the edge of a phone screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.skill-source-grid__item {
  display: flex;
  min-block-size: 100%;
  align-items: flex-start;
  gap: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 1rem;
  transition: border-color 200ms ease-out;
}

@media (hover: hover) {
  .skill-source-stream__item:hover .skill-source-stream__card,
  .skill-source-grid__item:hover {
    border-color: var(--ui-text-muted);
  }

  .skill-source-stream__item:hover .skill-source-stream__arrow {
    color: var(--ui-text);
    translate: 0.125rem -0.125rem;
  }
}

@media (min-width: 40rem) {
  .skill-source-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 64rem) {
  .skill-source-stream {
    block-size: 34rem;
  }

  .skill-source-stream__list {
    gap: 0.5rem;
    padding-block: 2rem;
  }

  .skill-source-stream__list::before {
    inset-block: 2rem;
  }
}

@media (min-width: 48rem) and (max-width: 63.999rem) {
  .skill-source-stream {
    block-size: 31rem;
  }
}

@media (forced-colors: active) {
  .skill-source-stream {
    mask-image: none;
    -webkit-mask-image: none;
  }

  .skill-source-stream__card,
  .skill-source-grid__item {
    border-color: CanvasText;
  }
}
</style>
