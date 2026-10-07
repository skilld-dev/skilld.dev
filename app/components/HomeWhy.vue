<script setup lang="ts">
import type { TrendingBoardRow } from '#shared/trending-range'
import type { WhyReasonId } from '~/utils/why-skilld'
import { HOME_WHY_REASONS, WHY_REASONS } from '~/utils/why-skilld'
import WhyText from './why/_WhyText.vue'
import WhyTrustLine from './why/_WhyTrustLine.vue'
import WhyVisual from './why/_WhyVisual.vue'

/**
 * What skilld does differently from skills.sh, in one screen. The reasons sit
 * in a list with every line showing, and one stage beside it draws the picked
 * reason as a small picture of the real interface. Hover, a click, or the
 * arrow keys pick a reason.
 *
 * Every picture renders, stacked in one grid cell, and only the picked one is
 * visible. The cell takes the tallest picture's height, so picking another
 * never moves the page.
 */
const { trendingRow } = defineProps<{
  /** The first trending row ranked by posts, for the ranking picture. */
  trendingRow: TrendingBoardRow | null
}>()

const reasons = HOME_WHY_REASONS.map(id => WHY_REASONS[id])
const active = ref<WhyReasonId>(reasons[0]!.id)
const tabRefs = useTemplateRef<HTMLButtonElement[]>('tabs')

function pick(id: WhyReasonId) {
  active.value = id
}

/** A mouse picks on hover. Touch and pen pick on tap, so a scroll never flips the stage. */
function onPointerEnter(event: PointerEvent, id: WhyReasonId) {
  if (event.pointerType === 'mouse')
    pick(id)
}

/** The tabs pattern: arrows move and pick, Home and End jump to the ends. */
function onKeydown(event: KeyboardEvent, index: number) {
  const last = reasons.length - 1
  const next = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    ? (index === last ? 0 : index + 1)
    : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
      ? (index === 0 ? last : index - 1)
      : event.key === 'Home'
        ? 0
        : event.key === 'End' ? last : null
  if (next === null)
    return
  event.preventDefault()
  pick(reasons[next]!.id)
  tabRefs.value?.[next]?.focus()
}
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
          </NuxtLink>, built around what a Skill does before your agent runs it.
        </p>
      </header>

      <div class="home-why mt-8">
        <div class="home-why__tabs" role="tablist" aria-orientation="vertical" aria-label="What skilld does differently">
          <button
            v-for="(reason, index) in reasons"
            :id="`why-tab-${reason.id}`"
            :key="reason.id"
            ref="tabs"
            type="button"
            role="tab"
            class="home-why__tab"
            :aria-selected="active === reason.id"
            :aria-controls="`why-panel-${reason.id}`"
            :tabindex="active === reason.id ? 0 : -1"
            @click="pick(reason.id)"
            @pointerenter="onPointerEnter($event, reason.id)"
            @keydown="onKeydown($event, index)"
          >
            <span class="home-why__icon" aria-hidden="true">
              <UIcon :name="reason.icon" class="size-4" />
            </span>
            <span class="min-w-0">
              <span class="home-why__title">{{ reason.title }}</span>
              <span class="home-why__line"><WhyText :text="reason.line" /></span>
            </span>
          </button>
        </div>

        <div class="home-why__stage">
          <div
            v-for="reason in reasons"
            :id="`why-panel-${reason.id}`"
            :key="reason.id"
            role="tabpanel"
            class="home-why__panel"
            :aria-labelledby="`why-tab-${reason.id}`"
            :data-active="active === reason.id ? '' : undefined"
            :inert="active !== reason.id"
          >
            <WhyVisual :id="reason.id" :trending-row="trendingRow" class="home-why__visual" />
            <p class="home-why__them">
              <span class="font-mono">skills.sh:</span> <WhyText :text="reason.skillsSh" />
            </p>
          </div>
        </div>
      </div>

      <WhyTrustLine class="mt-8" />
    </div>
  </section>
</template>

<style scoped>
.home-why {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}

@media (min-width: 64rem) {
  .home-why {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 3rem;
    align-items: start;
  }
}

.home-why__tabs {
  display: grid;
  border-top: 1px solid var(--ui-border);
}

.home-why__tab {
  display: flex;
  gap: 1rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.875rem 0.75rem;
  border-bottom: 1px solid var(--ui-border);
  text-align: left;
  cursor: pointer;
  transition: background-color 200ms ease-out;
}

.home-why__tab[aria-selected='true'] {
  background: var(--ui-bg-elevated);
}

.home-why__tab:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
}

/* An icon tile, as in the Developers menu. The picked row inks its tile. */
.home-why__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-top: -0.125rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  transition: color 200ms ease-out, border-color 200ms ease-out;
}

.home-why__tab[aria-selected='true'] .home-why__icon {
  border-color: var(--ui-border-accented);
  color: var(--ui-text-highlighted);
}

.home-why__title {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5rem;
  color: var(--ui-text-highlighted);
}

/* Every line shows, so the list reads whole without a single hover. */
.home-why__line {
  display: block;
  margin-top: 0.125rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
  text-wrap: pretty;
}

/* Every panel shares one cell, so the stage keeps the tallest panel's height. */
.home-why__stage {
  display: grid;
}

.home-why__panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  grid-area: 1 / 1;
  visibility: hidden;
  opacity: 0;
  transition: opacity 200ms ease-out, visibility 0s linear 200ms;
}

.home-why__panel[data-active] {
  visibility: visible;
  opacity: 1;
  transition: opacity 200ms ease-out, visibility 0s;
}

.home-why__visual {
  flex: 1;
}

.home-why__them {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--ui-text-muted);
  text-wrap: pretty;
}

@media (prefers-reduced-motion: reduce) {
  .home-why__tab,
  .home-why__icon,
  .home-why__panel,
  .home-why__panel[data-active] {
    transition: none;
  }
}
</style>
