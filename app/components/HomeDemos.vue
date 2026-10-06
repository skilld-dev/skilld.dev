<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'

/**
 * Skills with a demo, newest first: what the Agent made, before a visitor
 * runs anything. The page fetches `/api/skill-demos` and passes the items.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

/** Fewer than this reads as a broken feature, as with trending. */
const MIN_DEMOS_TO_SHOW = 3
const MAX_DEMOS = 6

const demos = computed(() => items.slice(0, MAX_DEMOS))
const show = computed(() => demos.value.length >= MIN_DEMOS_TO_SHOW)

function cover(demo: HomeDemoItem) {
  return demo.shots.find(shot => shot.viewport === 'desktop') ?? demo.shots[0]
}
</script>

<template>
  <section v-if="show" id="demos" class="home-wm" aria-labelledby="demos-heading">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <header>
        <h2 id="demos-heading" class="home-h2 text-balance">
          See what <span class="home-ink">skills make</span>.
        </h2>
        <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
          Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
        </p>
      </header>
      <ul class="home-demos__grid mt-8 list-none p-0">
        <li v-for="demo in demos" :key="`${demo.owner}/${demo.repo}/${demo.name}`" class="min-w-0">
          <NuxtLink :to="`${demo.skillPath}#demo`" class="home-demos__card">
            <img
              v-if="cover(demo)"
              :src="cover(demo)!.src"
              :width="cover(demo)!.width"
              :height="cover(demo)!.height"
              :alt="cover(demo)!.alt"
              loading="lazy"
              decoding="async"
              class="home-demos__shot"
            >
            <span class="block px-4 pt-3 font-mono text-sm text-default">/{{ demo.name }}</span>
            <span class="block px-4 font-mono text-xs text-muted">{{ demo.owner }}/{{ demo.repo }}</span>
            <span class="block px-4 pt-2 pb-4 text-sm leading-relaxed text-muted line-clamp-2">{{ demo.prompt }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.home-demos__grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 40rem) {
  .home-demos__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 64rem) {
  .home-demos__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.home-demos__card {
  display: block;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  transition: border-color 150ms ease;
}

.home-demos__card:hover,
.home-demos__card:focus-visible {
  border-color: var(--ui-border-accented);
}

.home-demos__shot {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  object-position: top;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
}

@media (prefers-reduced-motion: reduce) {
  .home-demos__card {
    transition: none;
  }
}
</style>
