<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoKey, demoPhoneRatio, HOME_DEMOS_MAX, HOME_DEMOS_MIN } from '~/utils/home-demos'
import SkillCard from '../SkillCard.vue'
import DemoMedia from './_DemoMedia.vue'
import DemoRecording from './_DemoRecording.vue'

/**
 * Take B, before and after. The newest demo leads at full width: what you
 * say, a line of dots, then what the Agent made, then the Skill as a row.
 * The others follow as a ledger of Skill rows, each with its prompt beside a
 * small frame of the output.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

const headingId = useId()
const demos = computed(() => items.slice(0, HOME_DEMOS_MAX))
const show = computed(() => demos.value.length >= HOME_DEMOS_MIN)
const lead = computed(() => demos.value[0])
const rest = computed(() => demos.value.slice(1))
</script>

<template>
  <section v-if="show && lead" class="home-wm" :aria-labelledby="headingId">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <h2 :id="headingId" class="home-h2 text-balance">
        See what <span class="home-ink">skills make</span>.
      </h2>
      <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
      </p>

      <article class="take-b__lead mt-8">
        <p class="take-b__say">
          <span class="data-label take-b__say-label">You say</span>
          <span class="take-b__quote">{{ lead.prompt }}</span>
        </p>
        <div class="take-b__joint" aria-hidden="true" />
        <div class="take-b__output-head">
          <span class="data-label" aria-hidden="true">Agent output</span>
          <DemoRecording :demo="lead" />
        </div>
        <NuxtLink
          :to="demoHref(lead)"
          class="take-b__window"
          :data-phone="demoHasPhoneFrame(lead) ? '' : undefined"
          :style="{ '--phone-ratio': demoPhoneRatio(lead) }"
          :aria-label="`Demo of /${lead.name}`"
        >
          <DemoMedia :demo="lead" />
        </NuxtLink>
        <div class="take-b__id">
          <SkillCard
            :skill="demoCardSkill(lead)"
            layout="row"
            metric="none"
            :description="false"
            :actions="['source', 'run']"
            surface="home-demos-lead"
          />
        </div>
      </article>

      <ul v-if="rest.length" class="take-b__ledger editorial-ledger list-none p-0">
        <li v-for="demo in rest" :key="demoKey(demo)" class="min-w-0">
          <SkillCard
            :skill="demoCardSkill(demo)"
            layout="row"
            metric="none"
            :description="false"
            :actions="['source', 'run']"
            surface="home-demos"
          >
            <template #footer>
              <div class="take-b__item">
                <p class="take-b__item-say line-clamp-3">
                  <span class="data-label mr-2">You say</span>{{ demo.prompt }}
                </p>
                <NuxtLink
                  :to="demoHref(demo)"
                  class="take-b__thumb"
                  :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
                  :style="{ '--phone-ratio': demoPhoneRatio(demo) }"
                  :aria-label="`Demo of /${demo.name}`"
                >
                  <DemoMedia :demo />
                </NuxtLink>
              </div>
            </template>
            <template #meta>
              <DemoRecording :demo />
            </template>
          </SkillCard>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* ---- the lead: before, a joint of dots, after ---- */
.take-b__say {
  display: grid;
  gap: 0.5rem;
  max-inline-size: 48rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
}

.take-b__quote {
  font-size: clamp(1rem, 0.9rem + 0.4vw, 1.25rem);
  line-height: 1.5;
  letter-spacing: -0.01em;
  color: var(--ui-text-highlighted);
  text-wrap: pretty;
}

/* Stone dots join what you say to what the Agent made, as in the lifecycle band. */
.take-b__joint {
  inline-size: 5px;
  block-size: 1.75rem;
  margin-inline-start: 1.5rem;
  background-image: radial-gradient(circle, var(--ui-text-dimmed) 1.1px, transparent 1.4px);
  background-size: 5px 7px;
  opacity: 0.7;
}

.take-b__output-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
  margin-block-end: 0.5rem;
}

.take-b__window,
.take-b__thumb {
  display: flex;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  transition: border-color 200ms ease-out;
}

@media (hover: hover) {
  .take-b__window:hover,
  .take-b__thumb:hover {
    border-color: var(--ui-border-accented);
  }
}

.take-b__window:focus-visible,
.take-b__thumb:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

@media (max-width: 39.99rem) {
  .take-b__window[data-phone] {
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }
}

.take-b__id {
  margin-block-start: 0.25rem;
}

/* ---- the ledger: the same order, one row each ---- */
.take-b__ledger {
  margin-block-start: 2.5rem;
}

/* Narrow rows: a small frame, then the words beside it. */
.take-b__item {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  align-items: start;
  gap: 0.875rem;
}

.take-b__item-say {
  grid-column: 2;
  grid-row: 1;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text);
}

.take-b__thumb {
  grid-column: 1;
  grid-row: 1;
}

@media (max-width: 39.99rem) {
  .take-b__thumb[data-phone] {
    aspect-ratio: var(--phone-ratio, 3 / 4);
  }
}

/* Wide rows read who, what, facts: the words lead and the frame follows them. */
@container skill-card-row (min-width: 40rem) {
  .take-b__item {
    grid-template-columns: minmax(0, 1fr) 11rem;
    gap: 1.25rem;
  }

  .take-b__item-say {
    grid-column: 1;
  }

  .take-b__thumb {
    grid-column: 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .take-b__window,
  .take-b__thumb {
    transition: none;
  }
}
</style>
