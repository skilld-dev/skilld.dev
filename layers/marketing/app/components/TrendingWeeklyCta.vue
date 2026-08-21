<script setup lang="ts">
import type { WeeklyDemoResponse } from '~~/server/api/weekly/demo.get'

/**
 * A compact rendering of the real weekly email.
 *
 * The preview stays inert because it is supporting artwork. The CTA below it
 * is the only promised action.
 */
const { data: demo } = await useFetch<WeeklyDemoResponse>('/api/weekly/demo', {
  key: 'trending-weekly-demo-v1',
})

const hasDemo = computed(() => !!demo.value?.card && (demo.value?.rowCount ?? 0) > 0)
const colorMode = useColorMode()
const card = computed(() =>
  colorMode.value === 'dark' ? demo.value?.card.dark : demo.value?.card.light,
)
const previewDocument = computed(() => card.value
  ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}body>table{width:100%!important;max-width:none!important;border:0!important;border-radius:0!important}</style></head><body>${card.value}</body></html>`
  : '',
)
</script>

<template>
  <aside class="trending-weekly-cta" aria-labelledby="trending-weekly-heading">
    <div
      v-if="hasDemo"
      class="trending-weekly-preview"
      inert
      aria-hidden="true"
    >
      <iframe
        class="trending-weekly-frame"
        :srcdoc="previewDocument"
        title=""
        tabindex="-1"
      />
    </div>

    <div class="trending-weekly-copy">
      <h2 id="trending-weekly-heading" class="text-base font-semibold leading-snug text-balance">
        Get the latest skills devs are talking about in your inbox.
      </h2>
      <UButton
        to="/login"
        label="Sign Up"
        icon="i-lucide-github"
        class="mt-5 min-h-11 w-full justify-center"
      />
    </div>
  </aside>
</template>

<style scoped>
.trending-weekly-cta {
  min-inline-size: 0;
  overflow: clip;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.trending-weekly-preview {
  block-size: 9.5rem;
  overflow: hidden;
  border-block-end: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
}

.trending-weekly-frame {
  display: block;
  inline-size: 200%;
  block-size: 19rem;
  border: 0;
  transform: scale(0.5);
  transform-origin: top left;
}

.trending-weekly-copy {
  padding: 1rem;
}

@media (forced-colors: active) {
  .trending-weekly-cta {
    border-color: CanvasText;
  }
}
</style>
