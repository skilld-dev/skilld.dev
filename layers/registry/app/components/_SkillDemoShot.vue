<script setup lang="ts">
import type { SkillDemoShot } from '../../server/utils/skill-demos'
import { useEventListener } from '@vueuse/core'

/**
 * One full-page screenshot inside a window one screen tall. The demo sits
 * above the fold, so the window is the Skill page's largest paint: it loads
 * the shot's first screen eagerly at high priority, and the whole page only
 * once someone scrolls the window. The box already has the whole page's
 * height, so the window scrolls before that image arrives.
 *
 * `skipMedia` names the screens where a twin window shows instead. There the
 * picture resolves to an empty pixel, so a hidden window downloads nothing.
 */
const { shot, skipMedia } = defineProps<{
  shot: SkillDemoShot
  skipMedia?: string
}>()

/** A 1x1 transparent GIF: what the hidden twin resolves to. */
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const root = useTemplateRef<HTMLElement>('root')
const first = computed(() => shot.poster ?? shot)
const wholePage = ref(false)

useEventListener(root, 'scroll', () => {
  wholePage.value = true
}, { passive: true, once: true })
</script>

<template>
  <div ref="root">
    <div class="skill-demo-shot" :style="{ aspectRatio: `${shot.width} / ${shot.height}` }">
      <picture>
        <source v-if="skipMedia" :media="skipMedia" :srcset="EMPTY_IMAGE">
        <img
          :src="first.src"
          :width="first.width"
          :height="first.height"
          :alt="shot.alt"
          fetchpriority="high"
          decoding="async"
          class="skill-demo-shot__first"
        >
      </picture>
      <img
        v-if="shot.poster && wholePage"
        :src="shot.src"
        :width="shot.width"
        :height="shot.height"
        alt=""
        decoding="async"
        class="skill-demo-shot__whole"
      >
    </div>
  </div>
</template>

<style scoped>
.skill-demo-shot {
  position: relative;
  inline-size: 100%;
}

.skill-demo-shot picture,
.skill-demo-shot__first {
  display: block;
  inline-size: 100%;
  block-size: auto;
}

/* Over the first screen, which it repeats, so the swap shows no seam. */
.skill-demo-shot__whole {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}
</style>
