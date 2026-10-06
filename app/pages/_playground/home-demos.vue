<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import TakeA from '~/components/home-demos/_TakeA.vue'
import TakeB from '~/components/home-demos/_TakeB.vue'
import TakeC from '~/components/home-demos/_TakeC.vue'
import TakeD from '~/components/home-demos/_TakeD.vue'

// Dev-only lab for the homepage demo section. 404s in production.
// Every take reads the same `HomeDemoItem[]` from the real endpoint.
definePageMeta({
  layout: false,
  validate: () => import.meta.dev,
})
useHead({ title: 'Home demos lab' })
useSeoMeta({ robots: 'noindex, nofollow' })

const { data } = await useFetch<{ items: HomeDemoItem[] }>('/api/skill-demos', { key: 'lab-home-demos' })

/**
 * A film demo, faked until one is recorded. The film is an ffmpeg test pattern
 * in `public/_lab/`, which stays out of git.
 */
const FILM_FIXTURE: HomeDemoItem = {
  owner: 'skilld-dev',
  repo: 'lab-fixtures',
  name: 'film-fixture',
  skillPath: '/gh/skilld-dev/lab-fixtures/film-fixture',
  authorName: 'Lab fixture',
  sourceUrl: null,
  prompt: 'Lab fixture: a six-second test pattern standing in for a film demo, such as a hyperframes or lemo-opuscar run.',
  agent: 'Claude Code',
  model: 'claude-opus-5-5',
  recordedAt: '2026-10-06',
  shots: [],
  video: { src: '/_lab/video-demo/film.mp4', poster: '/_lab/video-demo/poster.jpg', width: 1280, height: 720, durationSeconds: 6 },
}

/** The section hides below three, so three is the smallest case worth seeing. */
const counts = [3, 6] as const
const count = ref<(typeof counts)[number]>(6)
const filmPlaces = ['off', 'first', 'second'] as const
const filmAt = ref<(typeof filmPlaces)[number]>('second')
const demos = computed(() => {
  const real = data.value?.items ?? []
  const all = filmAt.value === 'off'
    ? real
    : filmAt.value === 'first' ? [FILM_FIXTURE, ...real] : [...real.slice(0, 1), FILM_FIXTURE, ...real.slice(1)]
  return all.slice(0, count.value)
})

const takes = [
  { id: 'a', component: TakeA, title: 'A · Output grid', idea: 'Equal Skill cards: who wrote the Skill, one screen of what the Agent made, the prompt, then how it was recorded.' },
  { id: 'b', component: TakeB, title: 'B · Before and after', idea: 'The newest demo at full width: the prompt, a joint of dots, the output. The rest follow as a ledger of rows.' },
  { id: 'c', component: TakeC, title: 'C · Rail of pages', idea: 'Tall frames hold each whole page at card width, so length shows. The rail bleeds off the right edge.' },
  { id: 'd', component: TakeD, title: 'D · Prompt index', idea: 'The prompts are the menu. Pick one; the stage scrolls through what the Agent made.' },
]
</script>

<template>
  <div class="min-h-dvh bg-default text-default">
    <header class="lab-bar sticky top-0 z-30 border-b border-default bg-default/95">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <h1 class="font-mono text-sm font-semibold">
          Home demos lab
        </h1>
        <span class="data-label">{{ data?.items.length ?? 0 }} demos from /api/skill-demos</span>
        <div class="ml-auto flex items-center gap-2">
          <span class="data-label">Show</span>
          <UButton
            v-for="option in counts"
            :key="option"
            :label="option === 6 ? 'all' : String(option)"
            size="xs"
            color="neutral"
            :variant="count === option ? 'solid' : 'outline'"
            class="font-mono"
            @click="() => { count = option }"
          />
          <span class="data-label ml-2">Film</span>
          <UButton
            v-for="place in filmPlaces"
            :key="place"
            :label="place"
            size="xs"
            color="neutral"
            :variant="filmAt === place ? 'solid' : 'outline'"
            class="font-mono"
            @click="() => { filmAt = place }"
          />
          <UColorModeButton />
        </div>
      </div>
    </header>

    <div class="space-y-16 py-10">
      <section v-for="take in takes" :id="`take-${take.id}`" :key="take.id" class="lab-take" :data-take="take.id">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 class="lab-take__title">
            {{ take.title }}
          </h2>
          <p class="lab-take__idea">
            {{ take.idea }}
          </p>
        </div>
        <!-- The homepage shell, so the band reads with its real type scale and watermark. -->
        <div class="home-page overflow-clip border-y border-default">
          <component :is="take.component" :demos />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lab-take__title {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
}

.lab-take__idea {
  margin-top: 0.25rem;
  margin-bottom: 1rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}
</style>
