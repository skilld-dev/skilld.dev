<script setup lang="ts">
import { createBrailleNamesScene } from '~/utils/textures/braille-names'

/**
 * "Braille names": Skill names read as braille far from the rose dot and
 * resolve into letters near it. The dot hops between names and each hop
 * ripples outward.
 *
 * Decoration. It fills its positioned parent, so the parent sets the size and
 * nothing shifts when it mounts. Pass real Skills, such as this week's
 * trending ones, as `owner/repo/skill`.
 */
const { names = [] } = defineProps<{
  /** Skill refs as `owner/repo/skill`. Without them it shows real registry Skills. */
  names?: readonly string[]
}>()

/** Real registry Skills, for a page that passes none. */
const REGISTRY_NAMES = [
  'anthropics/skills/pdf',
  'mattpocock/skills/tdd',
  'obra/superpowers/brainstorming',
  'vercel-labs/agent-skills/react-best-practices',
  'anthropics/skills/frontend-design',
  'obra/superpowers/systematic-debugging',
  'anthropics/skills/mcp-builder',
  'anthropics/skills/skill-creator',
  'vercel-labs/agent-skills/web-design-guidelines',
  'anthropics/skills/webapp-testing',
  'obra/superpowers/writing-plans',
  'obra/superpowers/test-driven-development',
]

const container = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
// Keyed on the text, so a parent that rebuilds the same list does not reset the field.
const key = computed(() => (names.length ? names : REGISTRY_NAMES).join('\n'))
const scene = computed(() => createBrailleNamesScene(key.value.split('\n')))
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
