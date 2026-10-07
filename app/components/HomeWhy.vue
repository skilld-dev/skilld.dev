<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { HomeDemoItem } from '~/utils/home-demos'
import { HOME_WHY_REASONS, WHY_REASONS } from '~/utils/why-skilld'
import WhyTrustLine from './why/_WhyTrustLine.vue'
import WhyVisual from './why/_WhyVisual.vue'

/**
 * What skilld does differently from skills.sh, as three columns: a title, one
 * line, and a small picture of the real interface. The skills.sh side of each
 * reason lives on `/vs/skills-sh`, so the homepage stays light.
 *
 * From 1024px the columns share one subgrid, so the titles, lines and pictures
 * each sit on one row, and every column ends at the same height.
 */
const { trendingRow, demos } = defineProps<{
  /** The first trending row ranked by posts, for the people picture. */
  trendingRow: TrendingBoardRow | null
  /** The approved demos, for the previews picture. */
  demos: readonly HomeDemoItem[]
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
          </NuxtLink> for devs who want to know who made a Skill before they run it.
        </p>
      </header>

      <ul class="home-why mt-8 list-none p-0">
        <li v-for="reason in reasons" :key="reason.id" class="home-why__col">
          <h3 class="home-why__title">
            <UIcon :name="reason.icon" class="size-4 shrink-0 text-muted" aria-hidden="true" />
            {{ reason.title }}
          </h3>
          <p class="home-why__line">
            {{ reason.summary }}
          </p>
          <WhyVisual :id="reason.id" :trending-row="trendingRow" :demos compact class="home-why__visual" />
        </li>
      </ul>

      <WhyTrustLine class="mt-8" />
    </div>
  </section>
</template>

<style scoped>
.home-why {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2.5rem;
}

.home-why__col {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

/* One subgrid: each row takes its tallest cell, so the pictures stretch to match. */
@media (min-width: 64rem) {
  .home-why {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto auto 1fr;
    column-gap: 1.5rem;
    row-gap: 0;
  }

  .home-why__col {
    display: grid;
    grid-row: span 3;
    grid-template-rows: subgrid;
  }
}

.home-why__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5rem;
  color: var(--ui-text-highlighted);
}

.home-why__line {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text-muted);
  text-wrap: pretty;
}

.home-why__visual {
  margin-top: 1rem;
}
</style>
