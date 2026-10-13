<script setup lang="ts">
/**
 * A digest example rendered from real public source changes.
 * Personal subscriptions never enter the anonymous preview.
 */

import type { DigestDemoResponse } from '#layers/identity/server/api/digest/demo.get'
import { compactWeeklyPreview, weeklyPreviewCss } from '#shared/weekly-preview'

useHead({ style: [{ key: 'weekly-preview', innerHTML: weeklyPreviewCss }] })

// A failed demo costs the section its picture, never its copy or its CTA:
// `data` stays null on error and `hasDemo` gates the whole frame.
// Only the card and its row count reach the payload. The answer also carries
// the whole email as `html`, which this preview never renders.
const { data: demo } = await useFetch('/api/digest/demo', {
  key: 'home-digest-demo-v2',
  transform: ({ card, rowCount }: DigestDemoResponse) => ({ card: compactWeeklyPreview(card), rowCount }),
})

const hasDemo = computed(() => !!demo.value?.card && (demo.value?.rowCount ?? 0) > 0)

/**
 * CSS changes the card's palette. Switching themes costs no request.
 */
const card = computed(() => demo.value?.card)
</script>

<template>
  <!--
    The card carries roughly twenty live links. Hidden from assistive tech and
    taken out of the tab order with `inert`: tabbing through an inbox screenshot
    in the middle of the homepage is a trap, and the copy beside it already
    states what the picture shows.
  -->
  <div v-if="hasDemo" class="home-weekly-demo">
    <p class="data-label">
      Example Skill updates · real commits
    </p>
    <div class="weekly-preview home-weekly-frame" aria-hidden="true" inert>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="home-weekly-card" v-html="card" />
    </div>
  </div>
</template>

<style scoped>
.home-weekly-demo {
  min-width: 0;
}

.home-weekly-frame {
  margin-top: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 0.75rem;
  background: var(--ui-bg-elevated);
  /* Cropped rather than scaled: a transform blurs the type, and the email is
     the one thing on this band that has to look exactly like itself. */
  max-block-size: 22rem;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 72%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 72%, transparent 100%);
}

.home-weekly-card :deep(table) {
  width: 100% !important;
  max-width: 100% !important;
}
</style>
