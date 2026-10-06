<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { githubAvatarProxyUrl } from '#shared/image-proxy'

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

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const canHover = useMediaQuery('(hover: hover)')

/** Plays a video card muted while the pointer or keyboard focus rests on it. */
function playVideo(event: Event): void {
  if (reducedMotion.value || !canHover.value)
    return
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  video?.play().catch((error: unknown) => {
    // A pause during loading aborts play(); that is the pointer leaving, not a fault. Any other refusal keeps the poster.
    if ((error as { name?: string } | null)?.name !== 'AbortError')
      console.warn('[home-demos] Video did not play:', error)
  })
}

function stopVideo(event: Event): void {
  const video = (event.currentTarget as HTMLElement).querySelector('video')
  if (!video)
    return
  video.pause()
  video.currentTime = 0
}

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

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
          <article
            class="home-demos__card"
            @mouseenter="playVideo"
            @mouseleave="stopVideo"
            @focusin="playVideo"
            @focusout="stopVideo"
          >
            <NuxtLink :to="`${demo.skillPath}#demo`" class="home-demos__link block">
              <span v-if="demo.video" class="home-demos__media">
                <video
                  :poster="demo.video.poster"
                  :width="demo.video.width"
                  :height="demo.video.height"
                  muted
                  loop
                  playsinline
                  preload="none"
                  aria-hidden="true"
                  class="home-demos__shot"
                >
                  <source :src="demo.video.src" type="video/mp4">
                </video>
                <span class="home-demos__duration data-label">
                  <UIcon name="i-lucide-play" class="size-3" aria-hidden="true" />
                  {{ formatDuration(demo.video.durationSeconds) }}
                  <span class="sr-only">video</span>
                </span>
              </span>
              <img
                v-else-if="cover(demo)"
                :src="cover(demo)!.src"
                :width="cover(demo)!.width"
                :height="cover(demo)!.height"
                :alt="cover(demo)!.alt"
                loading="lazy"
                decoding="async"
                class="home-demos__shot"
              >
              <span class="block px-4 pt-3 font-mono text-sm text-default">/{{ demo.name }}</span>
              <span class="px-4 pt-1 text-sm leading-relaxed text-muted line-clamp-2">{{ demo.prompt }}</span>
            </NuxtLink>
            <!-- Provenance (VISION principle 1): who wrote the Skill, and its SKILL.md. -->
            <p class="flex items-center gap-2 px-4 pt-3 pb-4 text-xs text-muted">
              <img
                :src="githubAvatarProxyUrl(demo.owner, 40)"
                alt=""
                width="20"
                height="20"
                class="size-5 shrink-0 rounded-full border border-default bg-muted"
                loading="lazy"
                decoding="async"
              >
              <span class="min-w-0 truncate">{{ demo.authorName ?? demo.owner }}</span>
              <a
                v-if="demo.sourceUrl"
                :href="demo.sourceUrl"
                target="_blank"
                rel="noopener"
                class="ml-auto inline-flex min-h-6 shrink-0 items-center font-mono underline underline-offset-2 hover:text-default"
                :aria-label="`SKILL.md for ${demo.name} on GitHub`"
              >SKILL.md</a>
            </p>
          </article>
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
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  transition: border-color 150ms ease;
}

.home-demos__card:hover,
.home-demos__card:focus-within {
  border-color: var(--ui-border-accented);
}

.home-demos__media {
  position: relative;
  display: block;
}

.home-demos__duration {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
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
