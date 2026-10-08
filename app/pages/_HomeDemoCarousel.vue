<script setup lang="ts">
import type { HomeDemoItem } from '../utils/home-demos'
import DemoStage from '../components/DemoStage.vue'
import { shuffled } from '../utils/random-order'

const { demos } = defineProps<{ demos: readonly HomeDemoItem[] }>()
const order = shallowRef<readonly HomeDemoItem[]>(demos)
const picked = ref(0)
const current = computed(() => order.value[picked.value])
const stageId = useId()

// Hydrate the cached page before choosing a fresh order for this visit.
onMounted(() => {
  order.value = shuffled(demos, Math.random)
})

function move(direction: -1 | 1): void {
  picked.value = (picked.value + direction + order.value.length) % order.value.length
}
</script>

<template>
  <div v-if="current" class="home-demo-carousel">
    <div :id="stageId">
      <DemoStage :demo="current" eager show-prompt surface="home-hero-demo" />
    </div>
    <div v-if="order.length > 1" class="home-demo-carousel__controls">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Previous demo"
        :aria-controls="stageId"
        class="min-h-11 min-w-11 justify-center"
        @click="move(-1)"
      />
      <span class="font-mono text-xs text-muted" aria-live="polite" aria-atomic="true">{{ picked + 1 }} of {{ order.length }}</span>
      <UButton
        icon="i-lucide-arrow-right"
        color="neutral"
        variant="ghost"
        aria-label="Next demo"
        :aria-controls="stageId"
        class="min-h-11 min-w-11 justify-center"
        @click="move(1)"
      />
    </div>
  </div>
</template>

<style scoped>
.home-demo-carousel {
  container-type: inline-size;
}

/* Each pick gets the same frame, including demos with a shorter phone shot. */
.home-demo-carousel :deep(.demo-stage__window) {
  block-size: clamp(16rem, 62.5cqi, 24rem);
  aspect-ratio: auto;
  inline-size: 100%;
}

.home-demo-carousel__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-block-start: 0.5rem;
}
</style>
