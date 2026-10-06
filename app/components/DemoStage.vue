<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoPhoneRatio } from '~/utils/home-demos'
import DemoMedia from './home-demos/_DemoMedia.vue'
import DemoRecording from './home-demos/_DemoRecording.vue'
import SkillCard from './SkillCard.vue'

/**
 * One demo on show: how it was recorded, the output in a window one screen
 * tall (a page that scrolls inside it, or a film that plays while on screen),
 * and the Skill's row with its run command. `showPrompt` adds the prompt in
 * full, for a list that names the demos without their prompts.
 */
const { demo, surface = 'demos', eager = false, showPrompt = false } = defineProps<{
  demo: HomeDemoItem
  /** The analytics surface for the run chip, such as `home-demos`. */
  surface?: string
  eager?: boolean
  showPrompt?: boolean
}>()
</script>

<template>
  <div class="demo-stage">
    <div class="demo-stage__head">
      <DemoRecording :demo />
      <NuxtLink :to="demoHref(demo)" class="demo-stage__open">
        Open the demo<span class="sr-only"> of /{{ demo.name }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" aria-hidden="true" />
      </NuxtLink>
    </div>
    <p v-if="showPrompt" class="demo-stage__prompt">
      <span class="data-label mr-2">You say</span>{{ demo.prompt }}
    </p>
    <!-- The whole page, in a window one screen tall. A film fills the window and plays on view. -->
    <div
      class="demo-stage__window"
      :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
      :style="{ '--phone-ratio': demoPhoneRatio(demo) }"
      :data-film="demo.video ? '' : undefined"
      tabindex="0"
      role="group"
      :aria-label="demo.video ? `The film the Agent made with /${demo.name}.` : `What the Agent made with /${demo.name}. Scroll to see the whole page.`"
    >
      <DemoMedia :demo :eager play="visible" />
    </div>
    <div class="demo-stage__id">
      <SkillCard
        :skill="demoCardSkill(demo)"
        layout="row"
        metric="none"
        :description="false"
        :actions="['run']"
        :surface
      />
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

/* A film keeps its 16:9 frame. */
.demo-stage__window[data-film] {
  block-size: min(56.25cqi, 72svh);
  overflow: hidden;
  --demo-height: 100%;
}

@media (max-width: 39.99rem) {
  .demo-stage__window[data-phone] {
    block-size: auto;
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }
}

.demo-stage__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

/* The Skill row's hover fill follows the rounded corners of everything around it. */
.demo-stage__id {
  margin-block-start: 0.25rem;
  overflow: hidden;
  border-radius: var(--ui-radius);
}
</style>
