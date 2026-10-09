<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoPagePath } from '#shared/demo-pages'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoPhoneRatio, demoRecording } from '~/utils/home-demos'
import DemoActions from './_DemoActions.vue'
import DemoMedia from './home-demos/_DemoMedia.vue'
import DemoRecording from './home-demos/_DemoRecording.vue'
import DemoWriting from './home-demos/_DemoWriting.vue'
import SkillCard from './SkillCard.vue'

/**
 * One demo on show: how it was recorded, the output in a window one screen
 * tall (a page that scrolls inside it, or a film that plays while on screen),
 * and the Skill's row with its run command. `showPrompt` adds the prompt in
 * full, for a list that names the demos without their prompts. `live` puts a
 * page demo's real output in the window, in a frame with no same-origin
 * access; the route serves it under a CSP sandbox too. `opens` picks where
 * "Open the demo" goes: the demo's own page, or, on that page, the Skill
 * page's Demo panel.
 */
const { demo, surface = 'demos', eager = false, showPrompt = false, live = false, opens = 'demo-page', presentation = 'full' } = defineProps<{
  demo: HomeDemoItem
  presentation?: 'full' | 'hero' | 'compact'
  /** The analytics surface for the run chip, such as `home-demos`. */
  surface?: string
  eager?: boolean
  showPrompt?: boolean
  live?: boolean
  opens?: 'demo-page' | 'skill-page'
}>()

/** The output page itself, when this stage shows it live. A film always plays as video. */
const stage = useTemplateRef<HTMLElement>('stage')
const { record } = useDemoEngagement(() => `${demo.owner}/${demo.repo}/${demo.name}`, surface, stage)
const recording = computed(() => demoRecording(demo))
const liveUrl = computed(() => live && !demo.video && !demo.writing ? demo.liveUrl : null)
</script>

<template>
  <div class="demo-stage" :class="{ 'demo-stage--compact': presentation === 'compact' }">
    <div v-if="presentation !== 'hero'" class="demo-stage__head">
      <details v-if="showPrompt && presentation === 'compact'" class="demo-stage__task">
        <summary class="data-label">
          <span>Prompt</span>
          <DemoRecording :demo />
        </summary>
        <p v-if="recording.usage" class="data-label demo-stage__usage">
          {{ recording.usage.sentence }}
        </p>
        <p class="demo-stage__prompt">
          {{ demo.prompt }}
        </p>
      </details>
      <DemoRecording v-else :demo />
      <NuxtLink :to="opens === 'skill-page' ? demoHref(demo) : demoPagePath(demo)" class="demo-stage__open">
        Open the demo<span class="sr-only"> of /{{ demo.name }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
      </NuxtLink>
    </div>
    <p v-if="showPrompt && presentation === 'full'" class="demo-stage__prompt">
      <span class="data-label mr-2">Prompt</span>{{ demo.prompt }}
    </p>
    <div v-if="demo.writing" ref="stage">
      <DemoWriting :writing="demo.writing" :output-label="`/${demo.name}`" />
    </div>
    <!-- The whole page, in a window one screen tall. A film fills the window and plays on view. -->
    <div
      v-else
      ref="stage"
      class="demo-stage__window"
      :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
      :style="demo.video
        ? { '--video-w': demo.video.width, '--video-h': demo.video.height }
        : { '--phone-ratio': demoPhoneRatio(demo) }"
      :data-film="demo.video ? '' : undefined"
      :data-live="liveUrl ? '' : undefined"
      :tabindex="liveUrl ? undefined : 0"
      role="group"
      :aria-label="demo.video ? `The film the Agent made with /${demo.name}.` : `What the Agent made with /${demo.name}. Scroll to see the whole page.`"
    >
      <iframe
        v-if="liveUrl"
        :src="liveUrl"
        sandbox="allow-scripts"
        :title="`Live output of /${demo.name}`"
        loading="lazy"
        class="demo-stage__frame"
      />
      <DemoMedia v-else :demo :eager play="visible" />
    </div>
    <div class="demo-stage__id">
      <SkillCard
        :skill="demoCardSkill(demo)"
        layout="row"
        metric="none"
        :description="false"
        :actions="[]"
        :surface
      />
      <NuxtLink v-if="presentation === 'hero'" :to="demoPagePath(demo)" class="demo-stage__open" :aria-label="`Open the demo of /${demo.name}`">
        Open the demo
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
      </NuxtLink>
      <DemoActions v-else :demo :surface @action="record" />
    </div>
  </div>
</template>

<style scoped>
/* The window sizes against the stage's own width, so a wide column never makes it taller than the screen. */
.demo-stage {
  container-type: inline-size;
}

.demo-stage__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  margin-block-end: 0.5rem;
}

.demo-stage__open {
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

.demo-stage__open:hover {
  color: var(--ui-text-highlighted);
}

.demo-stage__prompt {
  margin-block-end: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text);
}

/* 16:10 of the stage width, capped at most of the screen; the page scrolls inside it. */
.demo-stage__window {
  block-size: min(62.5cqi, 72svh);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  scrollbar-width: thin;
  --demo-height: auto;
}

/*
 * A film keeps its own frame: its aspect ratio, never wider than it was
 * rendered, and short enough to fit the screen. Centred when it is narrower
 * than the stage.
 */
.demo-stage__window[data-film] {
  block-size: auto;
  aspect-ratio: var(--video-w) / var(--video-h);
  inline-size: min(100%, calc(var(--video-w) * 1px), calc(72svh * var(--video-w) / var(--video-h)));
  margin-inline: auto;
  overflow: hidden;
  --demo-height: 100%;
}

@media (max-width: 39.99rem) {
  .demo-stage__window[data-phone] {
    block-size: auto;
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }

  .demo-stage__id :deep(.skill-card--row) {
    padding-block: 0.5rem;
  }

  .demo-stage__id :deep(.skill-card__row-end) {
    display: none;
  }
}

/* Give interactive pages most of the screen, while keeping their actions in reach. */
.demo-stage--compact .demo-stage__window {
  block-size: clamp(24rem, 68svh, 52rem);
  aspect-ratio: auto;
}

.demo-stage--compact .demo-stage__window[data-film] {
  block-size: auto;
  aspect-ratio: var(--video-w) / var(--video-h);
  inline-size: min(100%, calc(68svh * var(--video-w) / var(--video-h)));
}

.demo-stage--compact .demo-stage__id {
  position: sticky;
  inset-block-end: 0;
  z-index: 2;
  border-block-start: 1px solid var(--ui-border);
  background: var(--ui-bg);
  padding-block-end: env(safe-area-inset-bottom, 0px);
}

.demo-stage--compact .demo-stage__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.demo-stage--compact .demo-stage__open {
  grid-area: 1 / 2;
}

.demo-stage__task {
  grid-area: 1 / 1 / auto / -1;
}

.demo-stage__task summary {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding-inline-end: 8rem;
  min-block-size: 2.75rem;
  padding-block: 0.75rem;
  cursor: pointer;
}

.demo-stage__usage {
  margin-block: 0.5rem;
}

.demo-stage__task summary::before {
  content: '▸';
}

.demo-stage__task[open] summary::before {
  content: '▾';
}

.demo-stage__task :deep(.demo-recording__part) {
  white-space: normal;
}

.demo-stage__task summary:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

/* The live page scrolls inside its own frame. */
.demo-stage__window[data-live] {
  overflow: hidden;
  background: #fff;
}

.demo-stage__frame {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  border: 0;
}

.demo-stage__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

/* The Skill row's hover fill follows the rounded corners of everything around it. */
.demo-stage__id {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: 0.25rem;
  overflow: hidden;
  border-radius: var(--ui-radius);
}
</style>
