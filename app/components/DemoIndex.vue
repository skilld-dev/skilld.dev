<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { createReusableTemplate } from '@vueuse/core'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoKey, demoPhoneRatio } from '~/utils/home-demos'
import { resolveAuthorName } from '~/utils/skill-byline'
import DemoMedia from './home-demos/_DemoMedia.vue'
import DemoRecording from './home-demos/_DemoRecording.vue'
import SkillCard from './SkillCard.vue'

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

const [DefineStage, ReuseStage] = createReusableTemplate<{ demo: HomeDemoItem, eager?: boolean }>()
</script>

<template>
  <!-- One root, so a parent's class lands on it. -->
  <div class="demo-index">
    <DefineStage v-slot="{ demo, eager }">
      <div class="demo-index__stage-head">
        <DemoRecording :demo />
        <NuxtLink :to="demoHref(demo)" class="demo-index__open">
          Open the demo<span class="sr-only"> of /{{ demo.name }}</span>
          <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
        </NuxtLink>
      </div>
      <!-- The whole page, in a window one screen tall. A film fills the window and plays on focus. -->
      <div
        class="demo-index__window"
        :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
        :style="{ '--phone-ratio': demoPhoneRatio(demo) }"
        :data-film="demo.video ? '' : undefined"
        tabindex="0"
        role="group"
        :aria-label="demo.video ? `The film the Agent made with /${demo.name}.` : `What the Agent made with /${demo.name}. Scroll to see the whole page.`"
      >
        <DemoMedia :demo :eager play="visible" />
      </div>
      <div class="demo-index__id">
        <SkillCard
          :skill="demoCardSkill(demo)"
          layout="row"
          metric="none"
          :description="false"
          :actions="['run']"
          :surface
        />
      </div>
    </DefineStage>

    <div v-if="current" class="demo-index__grid">
      <!-- Wide screens: the list scrolls inside the stage's height. -->
      <div class="demo-index__rail">
        <ol class="demo-index__list list-none p-0" aria-label="Prompts">
          <li v-for="(demo, index) in demos" :key="demoKey(demo)" class="demo-index__entry">
            <button
              type="button"
              class="demo-index__pick"
              :aria-pressed="index === picked"
              :aria-controls="stageId"
              @click="() => pick(index)"
            >
              <span class="demo-index__pick-head">
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
              </span>
              <span class="demo-index__say line-clamp-2">
                <span class="sr-only">You say: </span>{{ demo.prompt }}
              </span>
            </button>
            <!-- Phones: the stage opens under the picked prompt. -->
            <div v-if="index === picked" class="demo-index__inline">
              <ReuseStage :demo />
            </div>
          </li>
        </ol>
      </div>

      <div :id="stageId" class="demo-index__stage">
        <Transition name="demo-index-swap" mode="out-in">
          <div :key="demoKey(current)">
            <ReuseStage :demo="current" />
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

.demo-index__pick {
  display: grid;
  inline-size: 100%;
  gap: 0.375rem;
  min-block-size: 2.75rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  text-align: start;
  cursor: pointer;
  transition: border-color 200ms ease-out, background-color 200ms ease-out;
}

@media (hover: hover) {
  .demo-index__pick:hover {
    border-color: var(--ui-border-accented);
  }
}

.demo-index__pick:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.demo-index__pick[aria-pressed='true'] {
  border-color: var(--ui-border-accented);
  background: var(--ui-bg-muted);
}

.demo-index__pick-head {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
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

.demo-index__pick[aria-pressed='true'] .demo-index__say {
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

.demo-index__stage-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  margin-block-end: 0.5rem;
}

.demo-index__open {
  display: inline-flex;
  min-block-size: 2.75rem;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.demo-index__open:hover {
  color: var(--ui-text-highlighted);
}

/* The page scrolls inside one screen, as on the Skill page. */
.demo-index__window {
  aspect-ratio: 16 / 10;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  scrollbar-width: thin;
  --demo-height: auto;
}

.demo-index__window[data-film] {
  overflow: hidden;
  --demo-height: 100%;
}

@media (max-width: 39.99rem) {
  .demo-index__window[data-phone] {
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }
}

.demo-index__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

/* The Skill row's hover fill follows the rounded corners of everything around it. */
.demo-index__id {
  margin-block-start: 0.25rem;
  overflow: hidden;
  border-radius: var(--ui-radius);
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
  .demo-index__pick {
    transition: none;
  }

  .demo-index-swap-enter-active,
  .demo-index-swap-leave-active {
    transition: none;
  }
}
</style>
