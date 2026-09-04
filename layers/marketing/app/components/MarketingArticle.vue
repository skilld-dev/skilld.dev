<script setup lang="ts">
import type { PageCollectionItemBase } from '@harlan-zw/comark-content'

/** Front matter fields the marketing article schema adds to the base page. */
type MarketingArticlePage = PageCollectionItemBase & {
  heading?: string
  label?: string
  author?: string
  command?: string
  cta?: { label: string, to: string }
}

const { page, label } = defineProps<{
  page: MarketingArticlePage
  /** Fallback data line when the front matter carries no `label`. */
  label?: string
}>()

const dataLine = computed(() => [
  page.label ?? label,
  page.author ? `Written by ${page.author}` : null,
].filter(Boolean).join(' · '))

const { copy, copied } = useClipboard()

function copyCommand(): void {
  if (page.command)
    void copy(page.command)
}
</script>

<template>
  <article class="learn-article mx-auto max-w-3xl px-4 py-12 prose prose-stone sm:px-6 dark:prose-invert">
    <header class="not-prose mb-10">
      <h1 class="text-4xl font-semibold leading-tight tracking-tight text-balance md:text-5xl">
        {{ page.heading ?? page.title }}
      </h1>
      <p class="mt-5 max-w-2xl text-base leading-relaxed text-muted text-pretty">
        {{ page.description }}
      </p>
      <p v-if="dataLine" class="data-label mt-4">
        {{ dataLine }}
      </p>

      <div
        v-if="page.command"
        class="mt-8 flex items-start gap-2 rounded-lg border border-default p-3 sm:p-4"
        data-testid="article-command"
      >
        <div class="min-w-0 flex-1 rounded-md border border-default bg-muted px-3 py-2 text-sm">
          <InstallCommand :command="page.command" wrap class="block" />
        </div>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="outline"
          class="min-h-11 min-w-11 shrink-0 justify-center"
          :aria-label="copied ? 'Command copied' : 'Copy command'"
          @click="copyCommand"
        />
      </div>
      <div v-else-if="page.cta" class="mt-8">
        <UButton
          :to="page.cta.to"
          :label="page.cta.label"
          color="primary"
          variant="solid"
          class="min-h-11"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
    </header>
    <ContentRenderer :value="page" />
  </article>
</template>

<style scoped>
.learn-article :deep(a) {
  color: var(--ui-text);
  text-decoration-color: var(--ui-color-primary-500);
}

.learn-article :deep(a:hover) {
  color: var(--ui-text-muted);
}
</style>
