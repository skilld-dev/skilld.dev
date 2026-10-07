<script setup lang="ts">
import type { FileIconName } from '#shared/file-icons'
import { fileIconSrc } from '#shared/file-icons'
import WhyPanel from './_WhyPanel.vue'

/**
 * The Skill page's file tree and Skill behaviors, drawn small: every file in
 * the folder with what it costs the Agent, then what the files ask the Agent
 * to do. The rows are `anthropics/skills/pdf` as production listed it on
 * 2026-10-07. Tokens use the Skill page's estimate of four bytes per token.
 */
interface FileRow {
  name: string
  icon: FileIconName
  /** What the file costs or does, as the Skill page labels it. */
  meta: string
  depth: 0 | 1
}

const FILES: FileRow[] = [
  { name: 'SKILL.md', icon: 'file-type-markdown', meta: '≈2.0k tokens', depth: 0 },
  { name: 'forms.md', icon: 'file-type-markdown', meta: '≈3.0k tokens', depth: 0 },
  { name: 'reference.md', icon: 'file-type-markdown', meta: '≈4.2k tokens', depth: 0 },
  { name: 'scripts', icon: 'default-folder-opened', meta: '8 files', depth: 0 },
  { name: 'fill_fillable_fields.py', icon: 'file-type-python', meta: 'script', depth: 1 },
]

const MORE_SCRIPTS = 7

const BEHAVIORS = [
  { icon: 'i-lucide-terminal', label: 'Runs shell commands', where: 'SKILL.md:192' },
  { icon: 'i-lucide-file-code', label: 'Ships scripts', where: '8 files' },
  { icon: 'i-lucide-package', label: 'Installs or runs packages', where: 'SKILL.md:235' },
]
</script>

<template>
  <WhyPanel label="anthropics/skills/pdf · 11 files">
    <ul class="why-files" aria-label="Files in the pdf Skill">
      <li
        v-for="file in FILES"
        :key="file.name"
        class="why-files__row"
        :data-depth="file.depth"
      >
        <img :src="fileIconSrc(file.icon)" alt="" width="14" height="14" class="why-files__icon">
        <span class="why-files__name">{{ file.name }}</span>
        <span class="why-files__meta">{{ file.meta }}</span>
      </li>
      <li class="why-files__row why-files__more" data-depth="1">
        + {{ MORE_SCRIPTS }} more scripts
      </li>
    </ul>
    <p class="why-files__heading">
      Skill behaviors
    </p>
    <ul class="why-files" aria-label="What the files ask the Agent to do">
      <li v-for="behavior in BEHAVIORS" :key="behavior.label" class="why-files__row">
        <UIcon :name="behavior.icon" class="why-files__icon text-muted" aria-hidden="true" />
        <span class="why-files__name why-files__name--sans">{{ behavior.label }}</span>
        <span class="why-files__meta why-files__link">{{ behavior.where }}</span>
      </li>
    </ul>
  </WhyPanel>
</template>

<style scoped>
.why-files {
  display: grid;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-files__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
}

.why-files__row[data-depth='1'] {
  padding-left: 1.375rem;
}

.why-files__icon {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
}

.why-files__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text);
}

.why-files__name--sans {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
}

.why-files__meta {
  flex: none;
  margin-left: auto;
  color: var(--ui-text-dimmed);
  font-variant-numeric: tabular-nums;
}

.why-files__link {
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-files__more {
  color: var(--ui-text-dimmed);
}

.why-files__heading {
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}
</style>
