<script setup lang="ts">
import type { SkillDemoView } from '../../server/utils/skill-demos'

/**
 * One demo (GLOSSARY "demo"): the prompt, the output an Agent made with this
 * Skill, and how it was recorded. Screenshots paint first. The live output
 * loads only on request, in a frame with no same-origin access, because the
 * route serves it under a CSP sandbox too.
 */
const { demo } = defineProps<{ demo: SkillDemoView }>()

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const desktopShot = computed(() => demo.shots.find(shot => shot.viewport === 'desktop') ?? demo.shots[0])
const mobileShot = computed(() => demo.shots.find(shot => shot.viewport === 'mobile' && shot !== desktopShot.value))
const recordedOn = computed(() => DATE_FORMAT.format(new Date(`${demo.recordedAt}T00:00:00Z`)))
const commitUrl = computed(() => `https://github.com/${demo.owner}/${demo.repo}/commit/${demo.skillCommit}`)

const live = ref(false)
</script>

<template>
  <section id="demo" class="skill-demo scroll-mt-24" aria-labelledby="demo-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="demo-heading" class="section-label">
        Demo
      </h2>
      <p class="data-label">
        Agent output, recorded with {{ demo.agent }} ({{ demo.model }}) on {{ recordedOn }} from
        <a :href="commitUrl" target="_blank" rel="noopener" class="underline underline-offset-2 hover:text-default">{{ demo.skillCommit.slice(0, 7) }}</a>
      </p>
    </div>

    <p class="skill-demo__prompt mt-3 text-sm leading-relaxed text-default">
      <span class="data-label mr-2">You say</span>{{ demo.prompt }}
    </p>

    <div v-if="live" class="mt-4">
      <iframe
        :src="demo.liveUrl"
        sandbox="allow-scripts"
        :title="`Live demo of ${demo.name}`"
        loading="lazy"
        class="skill-demo__frame"
      />
    </div>
    <!-- Each shot is the whole page, so it sits in a window the size of one screen and scrolls. -->
    <div v-else class="skill-demo__shots mt-4" :class="{ 'skill-demo__shots--pair': mobileShot }">
      <div
        v-if="desktopShot"
        class="skill-demo__window"
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
        :style="{ aspectRatio: '390 / 844' }"
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
.skill-demo__prompt {
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
}

.skill-demo__shots {
  display: grid;
  gap: 0.75rem;
  align-items: start;
}

@media (min-width: 48rem) {
  .skill-demo__shots--pair {
    grid-template-columns: minmax(0, 1fr) minmax(0, 11rem);
  }
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

/* The phone shot repeats the desktop one, so small screens show only the desktop. */
.skill-demo__window--mobile {
  display: none;
}

@media (min-width: 48rem) {
  .skill-demo__window--mobile {
    display: block;
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
</style>
