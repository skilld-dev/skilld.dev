<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { demoCardSkill, demoHasPhoneFrame, demoHref, demoKey, demoPhoneRatio, HOME_DEMOS_MAX, HOME_DEMOS_MIN } from '~/utils/home-demos'
import SkillCard from '../SkillCard.vue'
import DemoMedia from './_DemoMedia.vue'
import DemoRecording from './_DemoRecording.vue'

/**
 * Take A, the output grid. Every demo is an equal tile, and each tile is the
 * one Skill card: the Skill as every embed names it, then one screen of what
 * the Agent made and the prompt in its footer, then how it was recorded beside
 * the SKILL.md link and the run pill.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

const headingId = useId()
const demos = computed(() => items.slice(0, HOME_DEMOS_MAX))
const show = computed(() => demos.value.length >= HOME_DEMOS_MIN)
/** Pairs for two or four; rows of three for three, five and six. */
const columns = computed(() => demos.value.length % 2 === 0 && demos.value.length < 6 ? 2 : 3)
</script>

<template>
  <section v-if="show" class="home-wm" :aria-labelledby="headingId">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <h2 :id="headingId" class="home-h2 text-balance">
        See what <span class="home-ink">skills make</span>.
      </h2>
      <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
      </p>

      <ul class="take-a__grid mt-8 list-none p-0" :data-columns="columns">
        <li v-for="demo in demos" :key="demoKey(demo)" class="min-w-0">
          <SkillCard
            :skill="demoCardSkill(demo)"
            layout="card"
            metric="none"
            :description="false"
            :actions="['source', 'run']"
            surface="home-demos"
          >
            <template #footer>
              <NuxtLink
                :to="demoHref(demo)"
                class="take-a__window"
                :data-phone="demoHasPhoneFrame(demo) ? '' : undefined"
                :style="{ '--phone-ratio': demoPhoneRatio(demo) }"
                :aria-label="`Demo of /${demo.name}`"
              >
                <DemoMedia :demo />
              </NuxtLink>
              <p class="take-a__prompt line-clamp-3">
                <span class="data-label mr-2">You say</span>{{ demo.prompt }}
              </p>
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
.take-a__grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 40rem) {
  .take-a__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 64rem) {
  .take-a__grid[data-columns='3'] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .take-a__grid {
    gap: 1.5rem;
  }
}

/* One screen of the output: the first thing the recorded page showed. */
.take-a__window {
  display: flex;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
}

/* A phone shows the phone page, which needs a taller frame to read. */
@media (max-width: 39.99rem) {
  .take-a__window[data-phone] {
    aspect-ratio: var(--phone-ratio, 4 / 5);
  }
}

.take-a__window:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.take-a__prompt {
  margin-block-start: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text);
}
</style>
