<script setup lang="ts">
import type { WeeklyDemoResponse } from '~~/server/api/weekly/demo.get'

/**
 * A compact rendering of the real weekly email.
 *
 * The preview stays inert because it is supporting artwork. The CTA beside it
 * is the only promised action.
 *
 * A plain block, not an `<aside>`: the board renders it twice, beside the page
 * heading and between the board's halves, and one of them is always hidden.
 * Two complementary landmarks with the same name failed HTML validation.
 */
const { layout = 'stacked' } = defineProps<{
  /** `row` sets the preview beside the copy, for the page heading. */
  layout?: 'stacked' | 'row'
}>()

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
  <div class="trending-weekly-cta" :class="`trending-weekly-cta--${layout}`">
    <div
      v-if="hasDemo"
      class="trending-weekly-preview"
      inert
      aria-hidden="true"
    >
      <!--
        Client only: the card follows the reader's colour mode, which the
        server cannot know, so a light reader hydrated a dark card and Vue
        reported the mismatch. The box keeps its size either way.
      -->
      <ClientOnly>
        <iframe
          class="trending-weekly-frame"
          :srcdoc="previewDocument"
          title=""
          tabindex="-1"
        />
      </ClientOnly>
    </div>

    <div class="trending-weekly-copy">
      <h2 class="trending-weekly-heading font-semibold leading-snug text-balance">
        Get the latest skills devs are talking about in your inbox.
      </h2>
      <UButton
        to="/login"
        label="Sign in with GitHub"
        icon="i-lucide-github"
        class="trending-weekly-action min-h-11 w-full justify-center"
      />
    </div>
  </div>
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

.trending-weekly-heading {
  font-size: 1rem;
}

.trending-weekly-action {
  margin-top: 1.25rem;
}

/*
 * Beside the page heading: the email as a thumbnail, the copy beside it, and
 * no taller than the heading it sits next to. Rendered at full email width and
 * scaled to a quarter, since the picture only has to read as an inbox.
 */
.trending-weekly-cta--row {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
}

/* Out of flow, so the copy alone sets the height; a transform never shrinks layout. */
.trending-weekly-cta--row .trending-weekly-preview {
  position: relative;
  block-size: auto;
  border-block-end: 0;
  border-inline-end: 1px solid var(--ui-border);
}

.trending-weekly-cta--row .trending-weekly-frame {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 400%;
  block-size: 44rem;
  transform: scale(0.25);
}

.trending-weekly-cta--row .trending-weekly-copy {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.trending-weekly-cta--row .trending-weekly-heading {
  font-size: 0.9375rem;
}

.trending-weekly-cta--row .trending-weekly-action {
  margin-top: 0.75rem;
}

@media (forced-colors: active) {
  .trending-weekly-cta {
    border-color: CanvasText;
  }
}
</style>
