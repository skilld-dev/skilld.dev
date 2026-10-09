<script setup lang="ts">
import type { WritingDemo } from '#shared/writing-demo'
import { highlightToHtml } from '#shared/highlight'
import { writingDiff } from '#shared/writing-diff'
import { renderWritingMarkdown } from '#shared/writing-markdown'

const { writing } = defineProps<{ writing: WritingDemo }>()
const documentId = ref(writing.documents[0]?.id ?? '')
const showDiff = ref(false)
const document = computed(() => writing.documents.find(item => item.id === documentId.value) ?? writing.documents[0])
const markdown = computed(() => document.value?.output ?? '')
const html = computed(() => renderWritingMarkdown(markdown.value))
const sourceHtml = computed(() => highlightToHtml(markdown.value, 'md'))
const diff = computed(() => writingDiff(document.value?.original ?? '', document.value?.output ?? ''))
</script>

<template>
  <div class="writing-demo">
    <div class="writing-demo__controls">
      <div class="writing-demo__files" role="group" aria-label="Files">
        <button v-for="item in writing.documents" :key="item.id" type="button" :aria-pressed="documentId === item.id" @click="documentId = item.id">
          <SkillFileIcon name="file-type-markdown" />
          {{ item.label }}
        </button>
      </div>
      <button type="button" class="writing-demo__diff-toggle" :aria-pressed="showDiff" @click="showDiff = !showDiff">
        <UIcon name="i-lucide-git-compare-arrows" class="size-4 shrink-0" aria-hidden="true" />
        Diff
      </button>
    </div>
    <div
      :key="`${document?.id}/${showDiff ? 'diff' : 'updated'}`"
      class="writing-demo__window"
      tabindex="0"
      role="region"
      :aria-label="`${document?.label ?? 'Files'}, ${showDiff ? 'Diff' : 'Updated'}`"
    >
      <div v-if="showDiff" class="writing-demo__diff shiki">
        <template v-for="(line, index) in diff" :key="index">
          <div class="writing-demo__diff-line" :class="`writing-demo__diff-line--${line.kind}`">
            <span class="writing-demo__line-number" aria-hidden="true">{{ line.originalLine }}</span>
            <span class="writing-demo__line-number" aria-hidden="true">{{ line.updatedLine }}</span>
            <span class="writing-demo__line-sign">{{ line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ' }}</span>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <code class="writing-demo__line-code" v-html="line.html" />
          </div>
          <div v-if="line.kind !== 'context' && !line.text.endsWith('\n')" class="writing-demo__diff-note">
            \ No newline at end of file
          </div>
        </template>
      </div>
      <!-- The renderer strips raw HTML, images, and unsafe links. It never evaluates components. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <article
        v-else
        class="writing-demo__document skill-prose"
        :class="document?.format === 'article' ? 'writing-demo__article' : 'writing-demo__github'"
        v-html="html"
      />
    </div>
    <details v-if="!showDiff" class="writing-demo__markdown">
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
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-block-end: 0.75rem;
}

.writing-demo__files {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.writing-demo__diff-toggle { border: 1px solid var(--ui-border); }

.writing-demo__controls button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-block-size: 2.75rem;
  padding-inline: 0.75rem;
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.writing-demo__controls button:hover,
.writing-demo__controls button[aria-pressed="true"] {
  color: var(--ui-text);
  background: var(--ui-bg-muted);
}

.writing-demo__diff {
  min-inline-size: fit-content;
  padding-block: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.7;
}
.writing-demo__diff-line { display: flex; min-block-size: 1.7em; padding-inline: 0.5rem 1rem; }
.writing-demo__diff-line--added { background: light-dark(#dafbe1, #12261e); }
.writing-demo__diff-line--removed { background: light-dark(#ffebe9, #2d171b); }
.writing-demo__line-number { flex: 0 0 3ch; text-align: end; color: var(--ui-text-muted); user-select: none; }
.writing-demo__line-number + .writing-demo__line-number { margin-inline-start: 1ch; }
.writing-demo__line-sign { flex: 0 0 3ch; text-align: center; }
.writing-demo__line-code { flex: 1; white-space: pre; }
.writing-demo__diff-note { display: block; padding-inline-start: 11ch; color: var(--ui-text-muted); }

.writing-demo__window {
  max-block-size: clamp(24rem, 68svh, 52rem);
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

.writing-demo :is(button, summary, pre, .writing-demo__window):focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
