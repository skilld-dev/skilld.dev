<script setup lang="ts">
import type { HomeDemoItem } from '~/utils/home-demos'
import { DEMO_PHONE_MEDIA, demoDesktopShot, demoPhoneShot } from '~/utils/home-demos'

/**
 * The shot that fits the screen: the phone page on a phone when the demo has
 * one, the desktop page everywhere else. The take sizes and crops it through
 * `--demo-fit` and `--demo-position`.
 */
const { demo, eager = false } = defineProps<{
  demo: HomeDemoItem
  /** The one shot above the fold may skip lazy loading. */
  eager?: boolean
}>()

const desktop = computed(() => demoDesktopShot(demo))
const phone = computed(() => demoPhoneShot(demo))
</script>

<template>
  <picture v-if="desktop" class="demo-picture">
    <source v-if="phone" :media="DEMO_PHONE_MEDIA" :srcset="phone.src" :width="phone.width" :height="phone.height">
    <img
      :src="desktop.src"
      :width="desktop.width"
      :height="desktop.height"
      :alt="desktop.alt"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
    >
  </picture>
</template>

<style scoped>
.demo-picture {
  display: contents;
}

.demo-picture img {
  display: block;
  inline-size: 100%;
  block-size: var(--demo-height, 100%);
  object-fit: var(--demo-fit, cover);
  object-position: var(--demo-position, top center);
  background: var(--ui-bg-muted);
}
</style>
