<script setup lang="ts">
/**
 * The window every Why visual draws in: a bordered panel with a mono title
 * bar. Three stone dots stand in for window controls, so the panel reads as a
 * picture of a tool rather than as a card.
 */
const { label } = defineProps<{
  /** What the window shows, such as a path or a page name. */
  label: string
}>()
</script>

<template>
  <div class="why-panel">
    <div class="why-panel__bar">
      <span class="why-panel__lights" aria-hidden="true"><i /><i /><i /></span>
      <span class="why-panel__label">{{ label }}</span>
      <slot name="bar" />
    </div>
    <div class="why-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.why-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.why-panel__bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2rem;
  padding-inline: 0.75rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
  color: var(--ui-text-dimmed);
}

.why-panel__lights {
  display: inline-flex;
  flex: none;
  gap: 0.3rem;
}

.why-panel__lights i {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 999px;
  background: var(--ui-border-accented);
}

.why-panel__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * A column, so a picture can pin its last part to the bottom when a grid
 * stretches the panel. A size container, so a picture can fit its width.
 */
.why-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  container-type: inline-size;
  padding: 0.875rem 0.875rem 1rem;
}
</style>
