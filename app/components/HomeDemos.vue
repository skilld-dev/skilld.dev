<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { HOME_DEMOS_MAX, HOME_DEMOS_MIN } from '~/utils/home-demos'
import DemoIndex from './DemoIndex.vue'

/**
 * The homepage teaser for demos: the first few, pinned films first, and a
 * link to every demo on `/skills/demos`. The page fetches
 * `/api/skill-demos` and passes the items.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

const headingId = useId()
const demos = computed(() => items.slice(0, HOME_DEMOS_MAX))
const show = computed(() => demos.value.length >= HOME_DEMOS_MIN)
const more = computed(() => items.length)
</script>

<template>
  <section v-if="show" id="demos" class="home-wm" :aria-labelledby="headingId">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <h2 :id="headingId" class="home-h2 text-balance">
        See what <span class="home-ink">skills make</span>.
      </h2>
      <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
      </p>

      <DemoIndex :demos class="mt-8" surface="home-demos" />

      <UButton
        to="/skills/demos"
        :label="`All ${more} demos`"
        color="neutral"
        variant="ghost"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
        class="mt-4 min-h-11"
      />
    </div>
  </section>
</template>
