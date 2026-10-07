<script setup lang="ts">
import WhyPanel from './_WhyPanel.vue'

/**
 * Skill behaviors, drawn small. The first list is what `anthropics/skills/pdf`
 * asks an Agent to do, as production listed it on 2026-10-07, each with where
 * it appears. The second is the set the released CLI holds for approval:
 * a remote `skilld run` stops before any of them and changes nothing until the
 * user allows it. Labels are the rule labels from `skilld-protocol`.
 */
const SHOWN = [
  { icon: 'i-lucide-terminal', label: 'Runs shell commands', where: 'SKILL.md:192' },
  { icon: 'i-lucide-file-code', label: 'Ships scripts', where: '8 files' },
  { icon: 'i-lucide-package', label: 'Installs or runs packages', where: 'SKILL.md:235' },
]

const HELD = [
  'Runs code downloaded from the network',
  'Reads credential files or tokens',
  'Contains invisible characters',
]

/** Approval behaviors past the three listed: root commands and destructive deletes. */
const MORE_HELD = 2
</script>

<template>
  <WhyPanel label="anthropics/skills/pdf · Skill behaviors">
    <ul class="why-behaviors" aria-label="What the pdf Skill asks your agent to do">
      <li v-for="behavior in SHOWN" :key="behavior.label" class="why-behaviors__row">
        <UIcon :name="behavior.icon" class="why-behaviors__icon text-muted" aria-hidden="true" />
        <span class="why-behaviors__label">{{ behavior.label }}</span>
        <span class="why-behaviors__where">{{ behavior.where }}</span>
      </li>
    </ul>
    <p class="why-behaviors__heading">
      <code>skilld run</code> waits for your approval:
    </p>
    <ul class="why-behaviors" aria-label="Behaviors skilld run holds until you approve them">
      <li v-for="label in HELD" :key="label" class="why-behaviors__row">
        <UIcon name="i-lucide-triangle-alert" class="why-behaviors__icon text-warning" aria-hidden="true" />
        <span class="why-behaviors__label">{{ label }}</span>
      </li>
      <li class="why-behaviors__row why-behaviors__more">
        + {{ MORE_HELD }} more
      </li>
    </ul>
  </WhyPanel>
</template>

<style scoped>
.why-behaviors {
  display: grid;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-behaviors__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.5rem;
}

.why-behaviors__icon {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
}

.why-behaviors__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text);
}

.why-behaviors__where {
  flex: none;
  margin-left: auto;
  color: var(--ui-text-dimmed);
}

.why-behaviors__more {
  padding-left: 1.375rem;
  color: var(--ui-text-dimmed);
}

.why-behaviors__heading {
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--ui-border);
  /* Normal case, so the name keeps its lowercase (COPY.md). */
  color: var(--ui-text-muted);
}
</style>
