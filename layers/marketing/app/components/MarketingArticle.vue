<script setup lang="ts">
import type { PageCollectionItemBase } from '@harlan-zw/comark-content'
import { githubAvatarProxyUrl } from '#shared/image-proxy'

/** Front matter fields the marketing article schema adds to the base page. */
type MarketingArticlePage = PageCollectionItemBase & {
  heading?: string
  label?: string
  author?: string
  authorGithub?: string
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
      <div v-if="dataLine" class="mt-4 flex items-center gap-3">
        <img
          v-if="page.author && page.authorGithub"
          :src="githubAvatarProxyUrl(page.authorGithub, 80)"
          alt=""
          width="40"
          height="40"
          class="size-10 shrink-0 rounded-full"
        >
        <p class="data-label">
          {{ dataLine }}
        </p>
      </div>

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
    <slot />
  </article>
</template>

<style scoped>
/* The muted surface lowers command token contrast below 4.5:1 in light mode. */
.learn-article :deep(pre.shiki) {
  background: var(--ui-bg);
}

.learn-article :deep(a:not(:where(.not-prose, .not-prose *))) {
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-color-primary-500);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

.learn-article :deep(a:not(:where(.not-prose, .not-prose *)):hover) {
  color: var(--ui-text-muted);
  text-decoration-thickness: 2px;
}

.learn-article :deep(a:not(:where(.not-prose, .not-prose *)):focus-visible) {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}

/* Native article diagrams retain readable, server-rendered text in both themes. */
.learn-article :deep(.article-figure) {
  margin-block: 2rem;
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
}

.learn-article :deep(.article-figure p) {
  margin-block: 0.5rem;
}

.learn-article :deep(.article-figure code) {
  white-space: normal;
  overflow-wrap: anywhere;
}

.learn-article :deep(.article-figure figcaption) {
  margin-top: 1rem;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  line-height: 1.6;
  text-align: center;
}

.learn-article :deep(.skill-source) {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  text-align: center;
}

.learn-article :deep(.discovery-paths) {
  position: relative;
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid var(--ui-border);
}

.learn-article :deep(.discovery-paths::before) {
  position: absolute;
  top: -1.5rem;
  left: -1px;
  height: 1.5rem;
  border-left: 1px solid var(--ui-border);
  content: '';
}

.learn-article :deep(.discovery-path) {
  position: relative;
  min-width: 0;
}

.learn-article :deep(.discovery-path::before) {
  position: absolute;
  top: 1.25rem;
  left: -1rem;
  width: 1rem;
  border-top: 1px solid var(--ui-border);
  content: '';
}

.learn-article :deep(.check-stages) {
  display: grid;
  gap: 1rem;
  padding: 0;
  list-style: none;
}

.learn-article :deep(.check-stages li) {
  min-width: 0;
  padding: 0;
}

.learn-article :deep(.check-stages li + li) {
  padding-top: 1rem;
  border-top: 1px solid var(--ui-border);
}

.learn-article :deep(.result-pair) {
  display: grid;
  gap: 1rem;
}

.learn-article :deep(.result-finding) {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ui-border);
}

.learn-article :deep(.authoring-skills) {
  display: grid;
  gap: 1rem;
  margin-block: 1.5rem;
}

.learn-article :deep(.authoring-skill-card) {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.learn-article :deep(.authoring-skill-card h3) {
  margin-top: 0;
  font-family: var(--font-mono);
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.learn-article :deep(.authoring-skill-card a) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

.learn-article :deep(.authoring-skill-card pre) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (min-width: 640px) {
  .learn-article :deep(.skill-source::after) {
    position: absolute;
    top: 100%;
    left: 50%;
    height: 0.5rem;
    border-left: 1px solid var(--ui-border);
    content: '';
  }

  .learn-article :deep(.discovery-paths::before) {
    position: absolute;
    top: -1rem;
    left: calc((100% - 2rem) / 6);
    right: calc((100% - 2rem) / 6);
    height: 0;
    border-left: none;
    border-top: 1px solid var(--ui-border);
    content: '';
  }

  .learn-article :deep(.discovery-paths) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-left: 0;
    padding-left: 0;
    border-left: none;
  }

  .learn-article :deep(.discovery-path) {
    padding-top: 0.75rem;
    border-top: 1px solid var(--ui-border);
  }

  .learn-article :deep(.discovery-path::before) {
    top: -1rem;
    left: 50%;
    width: 0;
    height: 1rem;
    border-top: none;
    border-left: 1px solid var(--ui-border);
  }

  .learn-article :deep(.check-stages),
  .learn-article :deep(.result-pair),
  .learn-article :deep(.authoring-skills) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .learn-article :deep(.check-stages li + li) {
    padding-top: 0;
    border-top: none;
  }
}
</style>
