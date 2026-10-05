<script setup lang="ts">
import { createConvergeScene } from '~/utils/textures/converge'

/**
 * "Converge": scattered dots fall into one line that ends on a rose dot.
 *
 * As a divider it is decoration and hidden from screen readers. As a loading
 * indicator the dots stream into the line, and the element announces `label`.
 * It fills its positioned parent, so the parent sets the size: about 2.5rem
 * tall for a divider or a loading band, more for a stage.
 */
const {
  variant = 'divider',
  loading = false,
  label = 'Loading',
} = defineProps<{
  /** `divider` is sparse and runs nearly the full width. `stage` is denser, for a large panel. */
  variant?: 'divider' | 'stage'
  /** Stream the dots toward the rose dot and announce `label`. */
  loading?: boolean
  /** What a screen reader hears while `loading` is true. */
  label?: string
}>()

const container = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const scene = computed(() => createConvergeScene(variant === 'stage'
  ? { end: 0.86, perColumn: 7, dot: 4.4, flow: loading }
  : { end: 0.94, perColumn: 4, dot: 3.2, flow: loading }))
useTextureCanvas(container, canvas, scene)
</script>

<template>
  <div
    ref="container"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    :role="loading ? 'status' : undefined"
    :aria-hidden="loading ? undefined : 'true'"
  >
    <canvas ref="canvas" class="block size-full" aria-hidden="true" />
    <span v-if="loading" class="sr-only">{{ label }}</span>
  </div>
</template>
