<script setup lang="ts">
import type { HomeDemoItem, HomeDemoShot } from '~/utils/home-demos'
import { usePreferredReducedMotion, useScroll } from '@vueuse/core'
import { demoCardSkill, demoDesktopShot, demoHref, demoKey, demoPhoneShot, demoScreens, HOME_DEMOS_MAX, HOME_DEMOS_MIN } from '~/utils/home-demos'
import SkillCard from '../SkillCard.vue'
import DemoMedia from './_DemoMedia.vue'
import DemoRecording from './_DemoRecording.vue'

/**
 * Take C, the rail of pages. Each card is a tall frame holding the whole
 * output at the card's width, so a long page runs off the bottom and a short
 * one sits whole, as does a film. The rail bleeds off the right edge and
 * scrolls sideways.
 */
const { demos: items } = defineProps<{ demos: HomeDemoItem[] }>()

/**
 * The frame's height over its width: 20 by 23 on wide screens, 3 by 5 on
 * phones, where the card is the screen's width and can afford the length.
 * A page shorter than its frame sits whole, centred.
 */
const FRAME_RATIO = 23 / 20
const PHONE_FRAME_RATIO = 5 / 3

const headingId = useId()
const demos = computed(() => items.slice(0, HOME_DEMOS_MAX))
const show = computed(() => demos.value.length >= HOME_DEMOS_MIN)

interface RailFrame {
  /** The page runs past the frame, so it fades out at the bottom. */
  long: boolean
  /** `{n} screens` for a long page. */
  screens: string | null
}

function frameOf(shot: HomeDemoShot | undefined, ratio: number): RailFrame {
  if (!shot)
    return { long: false, screens: null }
  const long = shot.height / shot.width > ratio
  const count = demoScreens(shot)
  return { long, screens: long && count > 1 ? `${count} screens` : null }
}

/** A film is landscape on every screen, so it always sits whole. */
const FILM_FRAME: RailFrame = { long: false, screens: null }

const cards = computed(() => demos.value.map((demo) => {
  if (demo.video)
    return { demo, desktop: FILM_FRAME, phone: FILM_FRAME }
  const phone = demoPhoneShot(demo)
  return {
    demo,
    desktop: frameOf(demoDesktopShot(demo), FRAME_RATIO),
    // A phone falls back to the desktop shot when there is no phone shot.
    phone: frameOf(phone ?? demoDesktopShot(demo), PHONE_FRAME_RATIO),
  }
}))

const rail = useTemplateRef<HTMLElement>('rail')
const { arrivedState } = useScroll(rail)
const reducedMotion = usePreferredReducedMotion()

function page(direction: 1 | -1) {
  const el = rail.value
  const card = el?.querySelector('li')
  if (!el || !card)
    return
  el.scrollBy({
    left: direction * (card.getBoundingClientRect().width + 16),
    behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
  })
}
</script>

<template>
  <section v-if="show" class="take-c home-wm" :aria-labelledby="headingId">
    <span class="home-watermark" aria-hidden="true">Made</span>
    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <div class="take-c__head">
        <div class="min-w-0">
          <h2 :id="headingId" class="home-h2 text-balance">
            See what <span class="home-ink">skills make</span>.
          </h2>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-muted text-pretty">
            Each demo is one recorded run: the prompt, and what the Agent built with the Skill.
          </p>
        </div>
        <div class="take-c__nav">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-h-11 min-w-11 justify-center"
            aria-label="Earlier demos"
            :disabled="arrivedState.left"
            @click="() => page(-1)"
          />
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-h-11 min-w-11 justify-center"
            aria-label="More demos"
            :disabled="arrivedState.right"
            @click="() => page(1)"
          />
        </div>
      </div>

      <ul ref="rail" class="take-c__rail mt-8 list-none" aria-label="Demos">
        <li v-for="card in cards" :key="demoKey(card.demo)" class="take-c__slot">
          <SkillCard
            :skill="demoCardSkill(card.demo)"
            layout="card"
            metric="none"
            :description="false"
            :actions="['source', 'run']"
            surface="home-demos"
          >
            <template #footer>
              <NuxtLink
                :to="demoHref(card.demo)"
                class="take-c__frame"
                :data-long-desktop="card.desktop.long ? '' : undefined"
                :data-long-phone="card.phone.long ? '' : undefined"
                :aria-label="`Demo of /${card.demo.name}`"
              >
                <span class="take-c__page">
                  <DemoMedia :demo="card.demo" />
                </span>
                <span v-if="card.desktop.screens" class="take-c__screens take-c__screens--desktop data-label" aria-hidden="true">
                  {{ card.desktop.screens }}
                </span>
                <span v-if="card.phone.screens" class="take-c__screens take-c__screens--phone data-label" aria-hidden="true">
                  {{ card.phone.screens }}
                </span>
              </NuxtLink>
              <p class="take-c__prompt line-clamp-3">
                <span class="data-label mr-2">You say</span>{{ card.demo.prompt }}
              </p>
            </template>
            <template #meta>
              <DemoRecording :demo="card.demo" />
            </template>
          </SkillCard>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* The rail measures the band, not the page, so a scrollbar never pushes it wider. */
.take-c {
  container-type: inline-size;
}

.take-c__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
}

.take-c__nav {
  display: none;
  flex: none;
  gap: 0.5rem;
}

@media (hover: hover) and (min-width: 40rem) {
  .take-c__nav {
    display: flex;
  }
}

/*
 * Full bleed: the rail runs edge to edge, but its first card lines up with
 * the heading. The gutter matches the container's px-4 and sm:px-6.
 */
.take-c__rail {
  --gutter: 1rem;
  --inset: max(var(--gutter), calc((100cqw - 72rem) / 2 + var(--gutter)));

  display: flex;
  gap: 1rem;
  inline-size: 100cqw;
  margin-inline: calc(50% - 50cqw);
  padding-block: 0 0.75rem;
  padding-inline: var(--inset);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-padding-inline: var(--inset);
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
}

@media (min-width: 40rem) {
  .take-c__rail {
    --gutter: 1.5rem;
  }
}

.take-c__slot {
  flex: none;
  inline-size: min(78vw, 20rem);
  scroll-snap-align: start;
}

@media (min-width: 40rem) {
  .take-c__slot {
    inline-size: 22rem;
  }
}

/* The tall frame. The output keeps its width; only its length is cut. */
.take-c__frame {
  position: relative;
  display: flex;
  align-items: center;
  aspect-ratio: 20 / 23;
  overflow: hidden;
  padding: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  background: var(--ui-bg-muted);
  --demo-height: auto;
}

.take-c__frame:focus-visible {
  outline: 2px solid var(--ui-border-accented);
  outline-offset: 2px;
}

.take-c__page {
  display: block;
  inline-size: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.5);
}

/* A long page starts at the top and fades where the frame cuts it. */
@media (min-width: 40rem) {
  .take-c__frame[data-long-desktop] {
    align-items: flex-start;
    padding-block-end: 0;
  }

  .take-c__frame[data-long-desktop] .take-c__page {
    border-block-end: 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    mask-image: linear-gradient(to bottom, #000 70%, transparent);
  }

  .take-c__screens--phone {
    display: none;
  }
}

@media (max-width: 39.99rem) {
  .take-c__frame {
    aspect-ratio: 3 / 5;
  }

  .take-c__frame[data-long-phone] {
    align-items: flex-start;
    padding-block-end: 0;
  }

  .take-c__frame[data-long-phone] .take-c__page {
    border-block-end: 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    mask-image: linear-gradient(to bottom, #000 70%, transparent);
  }

  .take-c__screens--desktop {
    display: none;
  }
}

.take-c__screens {
  position: absolute;
  inset-inline-start: 0.75rem;
  inset-block-end: 0.625rem;
  padding: 0.125rem 0.375rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.5);
  background: var(--ui-bg);
}

.take-c__prompt {
  margin-block-start: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text);
}
</style>
