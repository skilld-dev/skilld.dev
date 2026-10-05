<script setup lang="ts">
import { createFileMinimapScene } from '~/utils/textures/file-minimap'

/**
 * "File minimap": SKILL.md files as editor minimap rows of dots, with a rose
 * cursor retyping the changed line of one file.
 *
 * Decoration. It fills its positioned parent, so the parent sets the size.
 * Pass real SKILL.md sources to draw real files; columns without one draw a
 * generated file with the same shape.
 */
const { sources = [] } = defineProps<{
  /** Raw SKILL.md text, one entry per file. */
  sources?: readonly string[]
}>()

const container = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const key = computed(() => sources.join('\u0000'))
const scene = computed(() => createFileMinimapScene(key.value ? key.value.split('\u0000') : []))
useTextureCanvas(container, canvas, scene)
</script>

<template>
  <div
    ref="container"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    aria-hidden="true"
  >
    <canvas ref="canvas" class="block size-full" />
  </div>
</template>
