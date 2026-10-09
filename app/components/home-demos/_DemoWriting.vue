<script setup lang="ts">
import type { WritingDemo } from '#shared/writing-demo'
import { highlightToHtml } from '#shared/highlight'
import { renderWritingMarkdown } from '#shared/writing-markdown'

const { writing, outputLabel } = defineProps<{ writing: WritingDemo, outputLabel: string }>()
const documentId = ref(writing.documents[0]?.id ?? '')
const version = ref<'original' | 'baseline' | 'output'>('output')
const document = computed(() => writing.documents.find(item => item.id === documentId.value) ?? writing.documents[0])
const markdown = computed(() => document.value?.[version.value] ?? '')
const html = computed(() => renderWritingMarkdown(markdown.value))
const sourceHtml = computed(() => highlightToHtml(markdown.value, 'md'))
const documentSelectId = useId()
const versionSelectId = useId()
</script>

<template>
  <div class="writing-demo">
    <div class="writing-demo__controls">
      <label :for="documentSelectId">
        <span>Document</span>
        <select :id="documentSelectId" v-model="documentId">
          <option v-for="item in writing.documents" :key="item.id" :value="item.id">
            {{ item.label }}
          </option>
        </select>
      </label>
      <label :for="versionSelectId">
        <span>Version</span>
        <select :id="versionSelectId" v-model="version">
          <option value="original">Original</option>
          <option value="baseline">No Skill</option>
          <option value="output">{{ outputLabel }}</option>
        </select>
      </label>
    </div>
    <div
      :key="`${document?.id}/${version}`"
      class="writing-demo__window"
      tabindex="0"
      role="region"
      :aria-label="`${document?.label ?? 'Document'}, ${version === 'output' ? outputLabel : version === 'baseline' ? 'No Skill' : 'Original'}`"
    >
      <!-- The renderer strips raw HTML, images, and unsafe links. It never evaluates components. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article
        class="writing-demo__document skill-prose"
        :class="document?.format === 'article' ? 'writing-demo__article' : 'writing-demo__github'"
        v-html="html"
      />
    </div>
    <details class="writing-demo__markdown">
      <summary>Markdown</summary>
      <!-- Highlighted source uses the same escaped rangi renderer as Skill pages. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="skill-markdown" role="region" aria-label="Markdown source" v-html="sourceHtml" />
    </details>
  </div>
</template>

<style scoped>
.writing-demo__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-block-end: 0.75rem;
}

.writing-demo__controls label {
  display: grid;
  gap: 0.25rem;
  min-inline-size: 0;
  flex: 1 1 10rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.writing-demo__controls select {
  inline-size: 100%;
  min-block-size: 2.75rem;
  padding-inline: 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  background: var(--ui-bg);
  font: inherit;
}

.writing-demo__window {
  block-size: clamp(24rem, 68svh, 52rem);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.writing-demo__document {
  max-inline-size: 65ch;
  margin-inline: auto;
  padding: clamp(1.25rem, 4vw, 2.5rem);
  overflow-wrap: anywhere;
  font-size: 1rem;
  line-height: 1.75;
}

.writing-demo__document :deep(h1) {
  margin-block: 0 1rem;
  font-size: 1.625rem;
  font-weight: 600;
  line-height: 1.3;
}

.writing-demo__document :deep(h2) {
  margin-block: 1.5rem 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.writing-demo__document :deep(h3) {
  margin-block: 1.25rem 0.5rem;
  font-weight: 600;
}

.writing-demo__document :deep(p),
.writing-demo__document :deep(ul),
.writing-demo__document :deep(ol),
.writing-demo__document :deep(pre),
.writing-demo__document :deep(blockquote) {
  margin-block: 0 1rem;
}

.writing-demo__document :deep(ul),
.writing-demo__document :deep(ol) {
  padding-inline-start: 1.5rem;
}

.writing-demo__document :deep(ul) {
  list-style: disc;
}

.writing-demo__document :deep(ol) {
  list-style: decimal;
}

.writing-demo__document :deep(a) {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.writing-demo__document :deep(blockquote) {
  padding-inline-start: 1rem;
  border-inline-start: 2px solid var(--ui-border-accented);
  color: var(--ui-text-muted);
}

.writing-demo__document :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.875em;
}

.writing-demo__document :deep(pre) {
  max-inline-size: 100%;
  overflow-x: auto;
  padding: 1rem;
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  background: var(--ui-bg-muted);
}

.writing-demo__document :deep(table) {
  display: block;
  max-inline-size: 100%;
  overflow-x: auto;
}

/* GitHub document typography, using the existing Markdown and rangi infrastructure. */
.writing-demo__github {
  max-inline-size: none;
  padding: clamp(1rem, 4vw, 2rem);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  line-height: 1.5;
}

.writing-demo__github :deep(h1),
.writing-demo__github :deep(h2) {
  padding-block-end: 0.3em;
  border-block-end: 1px solid var(--ui-border);
  margin-block: 1.5rem 1rem;
  line-height: 1.25;
}

.writing-demo__github :deep(h1) { font-size: 2rem; }
.writing-demo__github :deep(h2) { font-size: 1.5rem; }
.writing-demo__github :deep(h3) { font-size: 1.25rem; }
.writing-demo__github :deep(:first-child) { margin-block-start: 0; }
.writing-demo__github :deep(li) { margin-block: 0.25em; }
.writing-demo__github :deep(code) { font-size: 85%; }
.writing-demo__github :deep(code:not(pre code)) { border: 0; }
.writing-demo__github :deep(pre) {
  border: 0;
  font-size: 85%;
  line-height: 1.45;
}
.writing-demo__github :deep(pre code) { font-size: inherit; }
.writing-demo__github :deep(a) { color: light-dark(#0969da, #58a6ff); text-decoration: none; }
.writing-demo__github :deep(a:hover) { text-decoration: underline; }
.writing-demo__document :deep(a[target="_blank"]::after) { content: none; }
.writing-demo__github :deep(blockquote) { border-inline-start-width: 0.25em; font-style: normal; }
.writing-demo__github :deep(input[type="checkbox"]) { margin-inline-end: 0.5em; }

.writing-demo__markdown {
  margin-block-start: 0.25rem;
}

.writing-demo__markdown summary {
  inline-size: fit-content;
  min-block-size: 2.75rem;
  padding-block: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
  cursor: pointer;
}

.writing-demo__markdown :deep(pre) {
  max-block-size: 24rem;
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-muted);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.writing-demo :is(select, summary, pre, .writing-demo__window):focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
