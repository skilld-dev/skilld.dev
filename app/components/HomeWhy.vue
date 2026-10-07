<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import { HOME_WHY_REASONS, WHY_REASONS } from '~/utils/why-skilld'
import WhyText from './why/_WhyText.vue'
import WhyTrustLine from './why/_WhyTrustLine.vue'
import WhyVisual from './why/_WhyVisual.vue'

/**
 * What skilld does differently from skills.sh, shown rather than listed: each
 * reason is a small picture of the real interface, with its words under it.
 * The trust line carries the reasons that need no picture, and ends on the
 * full comparison at `/vs/skills-sh`.
 */
const { trendingRow } = defineProps<{
  /** The first trending row ranked by posts, for the ranking picture. */
  trendingRow: TrendingBoardRow | null
}>()

const reasons = HOME_WHY_REASONS.map(id => WHY_REASONS[id])
</script>

<template>
  <section id="why" class="home-wm" aria-labelledby="why-heading">
    <span class="home-watermark" aria-hidden="true">Why</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <header>
        <h2 id="why-heading" class="home-h2 text-balance">
          What skilld <span class="home-ink">does differently</span>.
        </h2>
        <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
          A <NuxtLink to="/vs/skills-sh" class="inline-block text-default underline underline-offset-4 hover:text-primary">
            skills.sh alternative
          </NuxtLink>, built around who wrote a Skill and what it does.
        </p>
      </header>
      <ul class="home-why__grid mt-8 list-none p-0">
        <li v-for="reason in reasons" :key="reason.id" class="home-why__tile">
          <WhyVisual :id="reason.id" :trending-row="trendingRow" class="home-why__visual" />
          <h3 class="mt-4 text-base font-semibold text-highlighted">
            {{ reason.title }}
          </h3>
          <p class="mt-1 text-sm leading-relaxed text-muted text-pretty">
            <WhyText :text="reason.line" />
          </p>
        </li>
      </ul>
      <WhyTrustLine class="mt-10" />
    </div>
  </section>
</template>

<style scoped>
.home-why__grid {
  display: grid;
  /* minmax, so a nowrap line inside a picture cannot widen the column past the screen. */
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem 1.5rem;
}

@media (min-width: 48rem) {
  .home-why__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* The pictures in a row share a height, and the words line up under them. */
.home-why__tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.home-why__visual {
  flex: 1;
}
</style>
