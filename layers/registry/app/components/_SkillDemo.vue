<script setup lang="ts">
import type { SkillDemoView } from '../../server/utils/skill-demos'
import { demoAgentIcon, demoModelLabel } from '#shared/demo-recording'

/**
 * One demo (GLOSSARY "demo"): the prompt, the output an Agent made with this
 * Skill, and how it was recorded. Screenshots paint first. The live output
 * loads only on request, in a frame with no same-origin access, because the
 * route serves it under a CSP sandbox too.
 */
const { demo } = defineProps<{ demo: SkillDemoView }>()

const desktopShot = computed(() => demo.shots.find(shot => shot.viewport === 'desktop') ?? demo.shots[0])
const mobileShot = computed(() => demo.shots.find(shot => shot.viewport === 'mobile' && shot !== desktopShot.value))
const recordedLabel = computed(() => `Recorded with ${demo.agent}, ${demoModelLabel(demo.model)}`)

const live = ref(false)
</script>

<template>
  <section id="demo" class="skill-demo scroll-mt-24" aria-labelledby="demo-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="demo-heading" class="section-label">
        Demo
      </h2>
      <!-- Short form on screen; the sentence it stands for is the title and the screen reader text. -->
      <p class="data-label inline-flex items-center gap-1.5" :title="recordedLabel">
        <span class="sr-only">{{ recordedLabel }}</span>
        <UIcon :name="demoAgentIcon(demo.agent)" class="size-3.5 shrink-0 text-default" aria-hidden="true" />
        <span aria-hidden="true">{{ demoModelLabel(demo.model) }}</span>
      </p>
    </div>

    <p class="skill-demo__prompt mt-3 text-sm leading-relaxed text-default">
      <span class="data-label mr-2">You say</span>{{ demo.prompt }}
    </p>
    <p v-if="demo.setup" class="mt-2 text-xs leading-relaxed text-muted">
      <span class="data-label mr-2">Folder</span>{{ demo.setup }}
    </p>

    <div v-if="live && demo.liveUrl" class="mt-4">
      <iframe
        :src="demo.liveUrl"
        sandbox="allow-scripts"
        :title="`Live demo of ${demo.name}`"
        loading="lazy"
        class="skill-demo__frame"
      />
    </div>
    <!-- A video Skill's demo is its rendered video, with sound on request. -->
    <div v-else-if="demo.video" class="mt-4">
      <video
        :poster="demo.video.poster"
        :width="demo.video.width"
        :height="demo.video.height"
        controls
        playsinline
        preload="none"
        class="skill-demo__video"
        :aria-label="`Video the Agent rendered with ${demo.name}`"
      >
        <source :src="demo.video.src" type="video/mp4">
      </video>
    </div>
    <!-- Each shot is the whole page, so it sits in a window the size of one screen and scrolls. -->
    <!-- One shot per device: the phone shot on phones when one exists, the desktop shot elsewhere. -->
    <div v-else class="mt-4">
      <div
        v-if="desktopShot"
        class="skill-demo__window"
        :class="{ 'skill-demo__window--desktop-only': mobileShot }"
        :style="{ aspectRatio: '16 / 10' }"
        :tabindex="desktopShot.height > desktopShot.width * 10 / 16 ? 0 : undefined"
        role="group"
        aria-label="Desktop screenshot. Scroll to see the whole page."
      >
        <img
          :src="desktopShot.src"
          :width="desktopShot.width"
          :height="desktopShot.height"
          :alt="desktopShot.alt"
          loading="lazy"
          decoding="async"
          class="skill-demo__shot"
        >
      </div>
      <div
        v-if="mobileShot"
        class="skill-demo__window skill-demo__window--mobile"
        :tabindex="mobileShot.height > 844 ? 0 : undefined"
        role="group"
        aria-label="Phone screenshot. Scroll to see the whole page."
      >
        <img
          :src="mobileShot.src"
          :width="mobileShot.width"
          :height="mobileShot.height"
          :alt="mobileShot.alt"
          loading="lazy"
          decoding="async"
          class="skill-demo__shot"
        >
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton
        v-if="demo.liveUrl"
        :label="live ? 'Show screenshots' : 'Open live demo'"
        :icon="live ? 'i-lucide-image' : 'i-lucide-play'"
        color="neutral"
        variant="outline"
        size="sm"
        class="min-h-11"
        :aria-pressed="live"
        @click="() => { live = !live }"
      />
      <a
        v-if="demo.liveUrl"
        :href="demo.liveUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 items-center gap-1 text-sm text-default underline underline-offset-4 hover:text-primary"
      >
        Open in a new tab
        <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0" aria-hidden="true" />
      </a>
      <a href="#run" class="inline-flex min-h-11 items-center gap-1 text-sm text-default underline underline-offset-4 hover:text-primary">
        Run it yourself
        <UIcon name="i-lucide-arrow-down" class="size-3.5 shrink-0" aria-hidden="true" />
      </a>
    </div>
    <p v-if="demo.outdated" class="mt-1 text-xs text-muted">
      Recorded on an older version of this Skill.
    </p>
  </section>
</template>

<style scoped>
.skill-demo__video {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
}

.skill-demo__prompt {
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
}

.skill-demo__window {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  scrollbar-width: thin;
}

.skill-demo__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.skill-demo__shot {
  display: block;
  width: 100%;
  height: auto;
}

/*
 * Full width and a fixed height, not an aspect ratio: a max-height on an
 * aspect-ratio box shrinks its width too, which left a narrow strip.
 */
.skill-demo__window--mobile {
  height: min(70svh, 48rem);
}

@media (min-width: 48rem) {
  .skill-demo__window--mobile {
    display: none;
  }
}

@media (max-width: 47.99rem) {
  .skill-demo__window--desktop-only {
    display: none;
  }
}

.skill-demo__frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: #fff;
}

/* On a phone the live page gets a phone-shaped frame, like its screenshot. */
@media (max-width: 47.99rem) {
  .skill-demo__frame {
    aspect-ratio: auto;
    height: min(70svh, 48rem);
  }
}
</style>
