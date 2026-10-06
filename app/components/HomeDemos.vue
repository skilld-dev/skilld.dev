<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { createReusableTemplate } from '@vueuse/core'
import { githubAvatarProxyUrl } from '#shared/image-proxy'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoKey, demoPhoneRatio, HOME_DEMOS_MAX, HOME_DEMOS_MIN } from '~/utils/home-demos'
import { resolveAuthorName } from '~/utils/skill-byline'
import DemoMedia from './home-demos/_DemoMedia.vue'
import DemoRecording from './home-demos/_DemoRecording.vue'
import SkillCard from './SkillCard.vue'

/**
 * Skills with a demo, as a prompt index. The prompts are the menu: pick one and
 * the stage shows what the Agent made from it, scrollable to the end of the
 * page, or its film playing. Each prompt carries a stone dot, and the picked
 * one turns rose. On a phone the stage opens under the picked prompt.
 * The page fetches `/api/skill-demos` and passes the items.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

const headingId = useId()
const stageId = useId()
const demos = computed(() => items.slice(0, HOME_DEMOS_MAX))
const show = computed(() => demos.value.length >= HOME_DEMOS_MIN)

const picked = ref(0)
const current = computed(() => demos.value[Math.min(picked.value, demos.value.length - 1)])

function author(demo: HomeDemoItem): string {
  return resolveAuthorName(demo.owner, demo.authorName) ?? demo.owner
}

const [DefineStage, ReuseStage] = createReusableTemplate<{ demo: HomeDemoItem, eager?: boolean }>()
</script>

<template>
  <DefineStage v-slot="{ demo, eager }">
    <div class="home-demos__stage-head">
      <span class="data-label" aria-hidden="true">Agent output</span>
      <DemoRecording :demo />
      <NuxtLink :to="demoHref(demo)" class="home-demos__open">
        Open the demo<span class="sr-only"> of /{{ demo.name }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
      </NuxtLink>
    </div>
    <!-- The whole page, in a window one screen tall. A film fills the window and plays on focus. -->
    <div
      class="home-demos__window"
      :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
      :style="{ '--phone-ratio': demoPhoneRatio(demo) }"
      :data-film="demo.video ? '' : undefined"
      tabindex="0"
      role="group"
      :aria-label="demo.video ? `The film the Agent made with /${demo.name}.` : `What the Agent made with /${demo.name}. Scroll to see the whole page.`"
    >
      <DemoMedia :demo :eager play="visible" />
    </div>
    <div class="home-demos__id">
      <SkillCard
        :skill="demoCardSkill(demo)"
        layout="row"
        metric="none"
        :description="false"
        :actions="['source', 'run']"
        surface="home-demos"
      />
    </div>
  </DefineStage>

  <section v-if="show && current" id="demos" class="home-wm" :aria-labelledby="headingId">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <h2 :id="headingId" class="home-h2 text-balance">
        See what <span class="home-ink">skills make</span>.
      </h2>
      <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
      </p>

      <div class="home-demos__grid mt-8">
        <ol class="home-demos__list list-none p-0" aria-label="Prompts">
          <li v-for="(demo, index) in demos" :key="demoKey(demo)" class="home-demos__entry">
            <button
              type="button"
              class="home-demos__pick"
              :aria-pressed="index === picked"
              :aria-controls="stageId"
              @click="() => { picked = index }"
            >
              <span class="home-demos__pick-head">
                <span class="home-demos__dot" aria-hidden="true" />
                <img
                  :src="githubAvatarProxyUrl(demo.owner, 40)"
                  alt=""
                  width="20"
                  height="20"
                  loading="lazy"
                  decoding="async"
                  class="home-demos__avatar"
                >
                <span class="home-demos__name">/{{ demo.name }}</span>
                <span class="home-demos__by">{{ author(demo) }}</span>
              </span>
              <span class="home-demos__say line-clamp-2">
                <span class="sr-only">You say: </span>{{ demo.prompt }}
              </span>
            </button>
            <!-- Phones: the stage opens under the picked prompt. -->
            <div v-if="index === picked" class="home-demos__inline">
              <ReuseStage :demo />
            </div>
          </li>
        </ol>

        <div :id="stageId" class="home-demos__stage">
          <Transition name="home-demos-swap" mode="out-in">
            <div :key="demoKey(current)">
              <ReuseStage :demo="current" />
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-demos__grid {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 64rem) {
  .home-demos__grid {
    grid-template-columns: minmax(0, 5fr) minmax(0, 8fr);
    gap: 2.5rem;
    align-items: start;
  }
}

.home-demos__list {
  display: grid;
  gap: 0.5rem;
}

.home-demos__pick {
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
  .home-demos__pick:hover {
    border-color: var(--ui-border-accented);
  }
}

.home-demos__pick:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.home-demos__pick[aria-pressed='true'] {
  border-color: var(--ui-border-accented);
  background: var(--ui-bg-muted);
}

.home-demos__pick-head {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
}

/* Stone for every prompt, rose for the one picked: the band's one rose dot. */
.home-demos__dot {
  flex: none;
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border: 1.5px solid var(--ui-text-dimmed);
  border-radius: 9999px;
}

.home-demos__pick[aria-pressed='true'] .home-demos__dot {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
}

.home-demos__avatar {
  flex: none;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--ui-bg-muted);
}

.home-demos__name {
  min-inline-size: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--ui-text-highlighted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-demos__by {
  flex: none;
  margin-inline-start: auto;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.home-demos__say {
  padding-inline-start: 1rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
}

.home-demos__pick[aria-pressed='true'] .home-demos__say {
  color: var(--ui-text);
}

/* One stage per width: under the prompt on phones, beside the list from 1024px. */
.home-demos__inline {
  margin-block-start: 0.75rem;
}

.home-demos__stage {
  display: none;
}

@media (min-width: 64rem) {
  .home-demos__inline {
    display: none;
  }

  .home-demos__stage {
    display: block;
    position: sticky;
    inset-block-start: 6rem;
  }
}

.home-demos__stage-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  margin-block-end: 0.5rem;
}

.home-demos__open {
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

.home-demos__open:hover {
  color: var(--ui-text-highlighted);
}

/* The page scrolls inside one screen, as on the Skill page. */
.home-demos__window {
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

.home-demos__window[data-film] {
  overflow: hidden;
  --demo-height: 100%;
}

@media (max-width: 39.99rem) {
  .home-demos__window[data-phone] {
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }
}

.home-demos__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.home-demos__id {
  margin-block-start: 0.25rem;
}

.home-demos-swap-enter-active,
.home-demos-swap-leave-active {
  transition: opacity 150ms ease-out;
}

.home-demos-swap-enter-from,
.home-demos-swap-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .home-demos__pick {
    transition: none;
  }

  .home-demos-swap-enter-active,
  .home-demos-swap-leave-active {
    transition: none;
  }
}
</style>
