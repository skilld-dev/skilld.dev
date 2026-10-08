<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoHref, demoPreviews, demoRecording } from '~/utils/home-demos'
import WhyPanel from './_WhyPanel.vue'

/**
 * Demos side by side: what three Skills made for the same kind of work, so a
 * reader compares output before spending a token on a run. Stills, not films,
 * because the demo section and the Skill page already play them.
 *
 * Landing pages lead, since five Skills hold a landing page demo. Without
 * two demos in one group the picture is not drawn.
 */
const { demos } = defineProps<{
  demos: readonly HomeDemoItem[]
}>()

const picked = computed(() => demoPreviews(demos))

function still(demo: HomeDemoItem) {
  if (demo.video)
    return { src: demo.video.poster, width: demo.video.width, height: demo.video.height, alt: `A frame of the film the Agent made with /${demo.name}.` }
  const shot = demo.shots.find(candidate => candidate.viewport === 'desktop') ?? demo.shots[0]
  return shot ? { src: shot.src, width: shot.width, height: shot.height, alt: shot.alt } : null
}
</script>

<template>
  <WhyPanel v-if="picked" label="skilld.dev/skills/demos">
    <ul class="why-previews" :aria-label="`${picked.label} that Skills made`">
      <li v-for="demo in picked.items" :key="`${demo.owner}/${demo.repo}/${demo.name}`">
        <NuxtLink :to="demoHref(demo)" class="why-previews__item">
          <span class="why-previews__still">
            <img
              v-if="still(demo)"
              :src="still(demo)!.src"
              :alt="still(demo)!.alt"
              :width="still(demo)!.width"
              :height="still(demo)!.height"
              loading="lazy"
              decoding="async"
            >
          </span>
          <span class="why-previews__name">/{{ demo.name }}</span>
          <span class="why-previews__by" :title="demoRecording(demo).sentence">
            <UIcon :name="demoRecording(demo).icon" class="size-3 shrink-0" aria-hidden="true" />
            <span aria-hidden="true">{{ demoRecording(demo).model }}</span>
            <span class="sr-only">{{ demoRecording(demo).sentence }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p class="why-previews__foot">
      Recorded runs · 0 tokens to compare
    </p>
  </WhyPanel>
</template>

<style scoped>
.why-previews {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.625rem;
  margin: 0 0 0.875rem;
  padding: 0;
  list-style: none;
}

.why-previews__item {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  border-radius: calc(var(--ui-radius) * 0.75);
}

.why-previews__item:focus-visible {
  outline-offset: 2px;
}

.why-previews__still {
  display: block;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  /* Square: tall enough to compare pages, short enough to keep columns level. */
  aspect-ratio: 1;
  transition: border-color 200ms ease-out;
}

.why-previews__item:hover .why-previews__still {
  border-color: var(--ui-border-accented);
}

.why-previews__still img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}

.why-previews__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.why-previews__by {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--ui-text-dimmed);
}

.why-previews__foot {
  margin-top: auto;
  padding-top: 0.875rem;
  color: var(--ui-text-dimmed);
}

/* A narrow column fits two stills, so the names stay readable. */
@container (max-width: 26rem) {
  .why-previews {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .why-previews > li:nth-child(n + 3) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .why-previews__still {
    transition: none;
  }
}
</style>
