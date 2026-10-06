<script setup lang="ts">
import type { HomeDemoItem, HomeDemoVideo } from '~/utils/home-demos'
import { useEventListener, useIntersectionObserver, useMediaQuery, usePreferredReducedMotion } from '@vueuse/core'
import { formatDemoDuration } from '~/utils/home-demos'

/**
 * A film demo: the poster, then the film muted and looped.
 *
 * `play="hover"` plays while the link around it has the pointer or the
 * keyboard focus, and leaving puts the poster back; touch screens keep the
 * poster. `play="visible"` plays whenever a quarter of it is on screen, on any
 * device, because it is the one large film on view. Reduced motion never
 * plays it: the poster and a play glyph stay, and the Skill page plays it.
 *
 * Nothing downloads until the first play.
 */
const { demo, video, eager = false, play = 'hover' } = defineProps<{
  demo: Pick<HomeDemoItem, 'name'>
  video: HomeDemoVideo
  eager?: boolean
  play?: 'hover' | 'visible'
}>()

const root = useTemplateRef<HTMLElement>('root')
const film = useTemplateRef<HTMLVideoElement>('film')

const canHover = useMediaQuery('(hover: hover)')
const motion = usePreferredReducedMotion()
const autoplay = computed(() => motion.value !== 'reduce' && (play === 'visible' || canHover.value))
const playing = ref(false)

/** The link or focusable frame around the film starts and stops it. */
const trigger = computed(() => root.value?.closest<HTMLElement>('a, button, [tabindex]') ?? root.value)

function start() {
  const el = film.value
  if (!autoplay.value || !el)
    return
  el.play().catch((error: unknown) => {
    // A leave before the first frame aborts the play. That is the visitor's choice, not a failure.
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    // Anything else, such as a codec the browser lacks: keep the poster up.
    playing.value = false
    console.warn(`[home-demos] /${demo.name} film did not play`, error)
  })
}

function stop() {
  const el = film.value
  playing.value = false
  if (!el)
    return
  el.pause()
  el.currentTime = 0
}

const hoverTrigger = computed(() => play === 'hover' ? trigger.value : undefined)
useEventListener(hoverTrigger, 'mouseenter', start)
useEventListener(hoverTrigger, 'mouseleave', stop)
useEventListener(hoverTrigger, 'focus', start)
useEventListener(hoverTrigger, 'blur', stop)

// A hidden twin (the phone or the desktop stage) never intersects, so only the shown one plays.
useIntersectionObserver(root, ([entry]) => {
  if (play !== 'visible')
    return
  if (entry?.isIntersecting)
    start()
  else
    stop()
}, { threshold: 0.25 })

const duration = computed(() => formatDemoDuration(video.durationSeconds))
</script>

<template>
  <span ref="root" class="demo-video" :style="{ '--video-ratio': `${video.width} / ${video.height}` }">
    <img
      :src="video.poster"
      :width="video.width"
      :height="video.height"
      :alt="`A frame from the film the Agent made with /${demo.name}`"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      class="demo-video__poster"
      :class="{ 'demo-video__poster--hidden': playing }"
    >
    <video
      ref="film"
      :src="video.src"
      :width="video.width"
      :height="video.height"
      preload="none"
      muted
      loop
      playsinline
      disablepictureinpicture
      aria-hidden="true"
      tabindex="-1"
      class="demo-video__film"
      @playing="() => { playing = true }"
    />
    <span class="demo-video__chip" aria-hidden="true">
      <UIcon :name="playing ? 'i-lucide-volume-x' : 'i-lucide-play'" class="size-3 shrink-0" />
      {{ duration }}
    </span>
    <span class="sr-only">Film, {{ duration }}.</span>
  </span>
</template>

<style scoped>
.demo-video {
  position: relative;
  display: block;
  inline-size: 100%;
  block-size: var(--demo-height, 100%);
  aspect-ratio: var(--video-ratio);
  overflow: hidden;
  background: var(--ui-bg-muted);
}

.demo-video__poster,
.demo-video__film {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  object-position: center;
}

.demo-video__poster {
  z-index: 1;
  transition: opacity 150ms ease-out;
}

.demo-video__poster--hidden {
  opacity: 0;
}

.demo-video__chip {
  position: absolute;
  z-index: 2;
  inset-inline-start: 0.5rem;
  inset-block-end: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.5);
  background: var(--ui-bg);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .demo-video__poster {
    transition: none;
  }
}
</style>
