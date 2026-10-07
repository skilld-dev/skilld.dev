<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoHref, demoRecording } from '~/utils/home-demos'
import WhyPanel from './_WhyPanel.vue'

/**
 * One demo, drawn small: the prompt, a still of what the Agent made, and how
 * it was recorded. A still rather than the film, because the demo section and
 * the Skill page already play them. Without a demo the picture is not drawn.
 */
const { demo } = defineProps<{
  demo: HomeDemoItem | null
}>()

/** A desktop still: the film's poster, else the first desktop shot. */
const still = computed(() => {
  if (!demo)
    return null
  if (demo.video)
    return { src: demo.video.poster, width: demo.video.width, height: demo.video.height, alt: `A frame of the film the Agent made with /${demo.name}.` }
  const shot = demo.shots.find(candidate => candidate.viewport === 'desktop') ?? demo.shots[0]
  return shot ? { src: shot.src, width: shot.width, height: shot.height, alt: shot.alt } : null
})

const recording = computed(() => demo ? demoRecording(demo) : null)
</script>

<template>
  <WhyPanel v-if="demo && still && recording" :label="`Demo · /${demo.name}`">
    <p class="why-demo__prompt">
      <span class="why-demo__label">Prompt</span>{{ demo.prompt }}
    </p>
    <NuxtLink :to="demoHref(demo)" class="why-demo__still">
      <img
        :src="still.src"
        :alt="still.alt"
        :width="still.width"
        :height="still.height"
        loading="lazy"
        decoding="async"
      >
    </NuxtLink>
    <p class="why-demo__recording" :title="recording.sentence">
      <UIcon :name="recording.icon" class="size-3.5 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{{ recording.model }}</span>
      <span class="sr-only">{{ recording.sentence }}</span>
    </p>
  </WhyPanel>
</template>

<style scoped>
.why-demo__prompt {
  display: -webkit-box;
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.why-demo__label {
  margin-right: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.why-demo__still {
  display: block;
  margin-top: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  aspect-ratio: 16 / 9;
}

.why-demo__still img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}

.why-demo__still:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.why-demo__recording {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.625rem;
  color: var(--ui-text-muted);
}
</style>
