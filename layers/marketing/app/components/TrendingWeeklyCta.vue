<script setup lang="ts">
import type { WeeklyDemoResponse } from '~~/server/api/weekly/demo.get'
import { useElementVisibility } from '@vueuse/core'

/**
 * A compact rendering of the real weekly email.
 *
 * The preview stays inert because it is supporting artwork. The CTA beside it
 * is the only promised action.
 *
 * A plain block, not an `<aside>`: the board renders it twice, in the sidebar
 * and between the board's halves, and one of them is always hidden. Two
 * complementary landmarks with the same name failed HTML validation.
 *
 * `rail` is the sidebar copy: the heading and the button, with no preview and
 * no card. In a 14rem column the email shrank past reading, and a framed box
 * with a picture, a heading and a button outweighed the range links above it.
 */
const { variant = 'card' } = defineProps<{
  variant?: 'card' | 'rail'
}>()

/**
 * The email loads in the browser, and only for the copy a reader can see.
 *
 * The frame only ever drew in the browser, yet the server fetched the email on
 * every render: a cold board waited on the email renderer, and both themes rode
 * in the payload. A `display: none` copy never intersects, so the hidden one of
 * the two never builds a frame, and neither asks until it nears the viewport.
 * Both share one request key, so the email is fetched once.
 */
const preview = useTemplateRef<HTMLElement>('preview')
const previewInView = useElementVisibility(preview, { rootMargin: '200px', once: true })

const { data: demo, status, execute } = useLazyFetch<WeeklyDemoResponse>('/api/weekly/demo', {
  key: 'trending-weekly-demo-v1',
  server: false,
  immediate: false,
})

watch(previewInView, (inView) => {
  if (inView && status.value === 'idle')
    void execute()
})

const hasDemo = computed(() => !!demo.value?.card && (demo.value?.rowCount ?? 0) > 0)
/** The box holds its space until the email arrives; only a week with no email drops it. */
const keepPreviewBox = computed(() => status.value !== 'error' && (status.value !== 'success' || hasDemo.value))
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
  <div class="trending-weekly-cta" :class="`trending-weekly-cta--${variant}`">
    <div
      v-if="variant === 'card' && keepPreviewBox"
      ref="preview"
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
          v-if="hasDemo && previewInView"
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
        :size="variant === 'rail' ? 'sm' : 'md'"
        class="trending-weekly-action w-full justify-center"
      />
    </div>
  </div>
</template>

<style scoped>
.trending-weekly-cta {
  min-inline-size: 0;
}

.trending-weekly-cta--card {
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

.trending-weekly-heading {
  font-size: 1rem;
}

.trending-weekly-cta--card .trending-weekly-copy {
  padding: 1rem;
}

.trending-weekly-action {
  min-block-size: 2.75rem;
  margin-top: 1.25rem;
}

/*
 * Set like the sidebar's own headings, so the invitation reads as one more
 * section of the rail. The button keeps its whole label in the 14rem column.
 */
.trending-weekly-cta--rail .trending-weekly-heading {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.trending-weekly-cta--rail .trending-weekly-action {
  min-block-size: 2.25rem;
  margin-top: 0.75rem;
}

@media (pointer: coarse) {
  .trending-weekly-cta--rail .trending-weekly-action {
    min-block-size: 2.75rem;
  }
}

@media (forced-colors: active) {
  .trending-weekly-cta--card {
    border-color: CanvasText;
  }
}
</style>
