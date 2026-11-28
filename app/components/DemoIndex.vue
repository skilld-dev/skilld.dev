<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { demoKey } from '~/utils/home-demos'
import { resolveAuthorName } from '~/utils/skill-byline'
import DemoStage from './DemoStage.vue'

/**
 * Demos as a prompt index. The prompts are the menu: pick one and the stage
 * shows what the Agent made from it, scrollable to the end of the page, or its
 * film playing. Each prompt carries a stone dot, and the picked one turns rose.
 * On a phone the stage opens under the picked prompt.
 */
const { demos, initialKey, surface = 'demos' } = defineProps<{
  demos: HomeDemoItem[]
  /** `owner/repo/name` of the demo to show first, such as one from a shared link. */
  initialKey?: string
  /** The analytics surface for the run chip, such as `home-demos`. */
  surface?: string
}>()

const emit = defineEmits<{ pick: [demo: HomeDemoItem] }>()

const stageId = useId()
const promptIdPrefix = useId()

const picked = ref(Math.max(0, demos.findIndex(demo => demoKey(demo) === initialKey)))
const current = computed(() => demos[Math.min(picked.value, demos.length - 1)])

function pick(index: number): void {
  picked.value = index
  const demo = demos[index]
  if (demo)
    emit('pick', demo)
}

function author(demo: HomeDemoItem): string {
  return resolveAuthorName(demo.owner, demo.authorName) ?? demo.owner
}
</script>

<template>
  <!-- One root, so a parent's class lands on it. -->
  <div class="demo-index">
    <div v-if="current" class="demo-index__grid">
      <!-- Wide screens: the list scrolls inside the stage's height. -->
      <div class="demo-index__rail">
        <ol class="demo-index__list list-none p-0" aria-label="Prompts">
          <li v-for="(demo, index) in demos" :key="demoKey(demo)" class="demo-index__entry">
            <div class="demo-index__card" :data-picked="index === picked ? 'true' : undefined">
              <button
                type="button"
                class="demo-index__pick"
                :aria-pressed="index === picked"
                :aria-controls="stageId"
                :aria-describedby="`${promptIdPrefix}-${index}`"
                @click="() => pick(index)"
              >
                <span class="demo-index__dot" aria-hidden="true" />
                <img
                  :src="githubAvatarProxyUrl(demo.owner, 40)"
                  alt=""
                  width="20"
                  height="20"
                  loading="lazy"
                  decoding="async"
                  class="demo-index__avatar"
                >
                <span class="demo-index__name">/{{ demo.name }}</span>
                <span class="demo-index__by">{{ author(demo) }}</span>
              </button>
              <p :id="`${promptIdPrefix}-${index}`" class="demo-index__say line-clamp-2">
                <span class="sr-only">Prompt: </span>{{ demo.prompt }}
              </p>
            </div>
            <!-- Phones: the stage opens under the picked prompt. -->
            <div v-if="index === picked" class="demo-index__inline">
              <DemoStage :demo :surface />
            </div>
          </li>
        </ol>
      </div>

      <div :id="stageId" class="demo-index__stage">
        <Transition name="demo-index-swap" mode="out-in">
          <div :key="demoKey(current)">
            <DemoStage :demo="current" :surface />
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-index__grid {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 64rem) {
  .demo-index__grid {
    grid-template-columns: minmax(0, 5fr) minmax(0, 8fr);
    gap: 2.5rem;
    align-items: start;
  }
}

.demo-index__list {
  display: grid;
  align-content: start;
  gap: 0.5rem;
}

@media (min-width: 64rem) {
  .demo-index__grid {
    align-items: stretch;
  }

  .demo-index__rail {
    position: relative;
  }

  /* Out of flow, so the stage alone sets the row height and the list scrolls in it. */
  .demo-index__list {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    /* Room for the focus ring, which the scroll box would clip. */
    padding: 3px 0.5rem 3px 3px;
  }
}

.demo-index__card {
  position: relative;
  display: grid;
  inline-size: 100%;
  gap: 0.375rem;
  min-block-size: 2.75rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  transition: border-color 200ms ease-out, background-color 200ms ease-out;
}

@media (hover: hover) {
  .demo-index__card:hover {
    border-color: var(--ui-border-accented);
  }
}

.demo-index__card[data-picked='true'] {
  border-color: var(--ui-border-accented);
  background: var(--ui-bg-muted);
}

.demo-index__pick {
  display: flex;
  min-inline-size: 0;
  inline-size: 100%;
  align-items: center;
  gap: 0.5rem;
  text-align: start;
  cursor: pointer;
}

.demo-index__pick::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--ui-radius);
}

.demo-index__pick:focus-visible {
  outline: none;
}

.demo-index__pick:focus-visible::after {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

/* Stone for every prompt, rose for the one picked: the band's one rose dot. */
.demo-index__dot {
  flex: none;
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border: 1.5px solid var(--ui-text-dimmed);
  border-radius: 9999px;
}

.demo-index__pick[aria-pressed='true'] .demo-index__dot {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
}

.demo-index__avatar {
  flex: none;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg-muted);
}

.demo-index__name {
  min-inline-size: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ui-text-highlighted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-index__by {
  flex: none;
  margin-inline-start: auto;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.demo-index__say {
  padding-inline-start: 1rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.demo-index__card[data-picked='true'] .demo-index__say {
  color: var(--ui-text);
}

/* One stage per width: under the prompt on phones, beside the list from 1024px. */
.demo-index__inline {
  margin-block-start: 0.75rem;
}

.demo-index__stage {
  display: none;
}

@media (min-width: 64rem) {
  .demo-index__inline {
    display: none;
  }

  .demo-index__stage {
    display: block;
    position: sticky;
    inset-block-start: 6rem;
  }
}

.demo-index-swap-enter-active,
.demo-index-swap-leave-active {
  transition: opacity 150ms ease-out;
}

.demo-index-swap-enter-from,
.demo-index-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .demo-index__card {
    transition: none;
  }

  .demo-index-swap-enter-active,
  .demo-index-swap-leave-active {
    transition: none;
  }
}
</style>
