<script setup lang="ts">
import { ref } from 'vue'

const agents = [
  { name: 'Claude Code', shape: 'round' },
  { name: 'Codex', shape: 'square' },
  { name: 'Cursor', shape: 'cut' },
] as const
const selected = ref<(typeof agents)[number]>(agents[0])
</script>

<template>
  <section class="portable-knowledge" aria-label="Portable knowledge brand experiment">
    <header class="portable-heading">
      <h3>Same Skill. Your Agent.</h3>
      <p>The Agent changes. The knowledge stays yours.</p>
    </header>

    <div class="portable-stage" :data-shape="selected.shape" aria-hidden="true">
      <div class="portable-axis axis-horizontal" />
      <div class="portable-axis axis-vertical" />
      <div class="portable-shell shell-outer" />
      <div class="portable-shell shell-inner" />
      <div class="portable-document">
        <div class="document-title">
          SKILL.md
        </div>
        <div class="knowledge-pattern">
          <i v-for="line in 12" :key="line" :class="`knowledge-line line-${line}`" />
        </div>
        <div class="document-footer">
          skilld
        </div>
      </div>
      <span class="context-label">{{ selected.name }}</span>
      <span class="constant-label">One Skill</span>
    </div>

    <fieldset class="portable-controls">
      <legend>Change Agent</legend>
      <div class="agent-options">
        <button
          v-for="agent in agents"
          :key="agent.name"
          type="button"
          :aria-pressed="selected.name === agent.name"
          @click="selected = agent"
        >
          {{ agent.name }}
        </button>
      </div>
    </fieldset>
    <p class="portable-caption" aria-live="polite">
      {{ selected.name }} selected. Same SKILL.md.
    </p>
  </section>
</template>

<style scoped>
.portable-knowledge {
  color: var(--ui-text);
  background: var(--ui-bg);
  container-type: inline-size;
}

.portable-heading h3 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: clamp(1.5rem, 5cqi, 2rem);
  font-weight: 600;
  letter-spacing: -0.045em;
}

.portable-heading p {
  margin: 0.75rem 0 0;
  color: var(--ui-text-muted);
  font-size: 1rem;
  line-height: 1.6;
}

.portable-stage {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  height: clamp(300px, 65cqi, 390px);
  margin: 1.5rem 0;
  overflow: hidden;
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
}

.portable-axis {
  position: absolute;
  opacity: 0.7;
  background: var(--ui-border);
}

.axis-horizontal {
  width: 100%;
  height: 1px;
}

.axis-vertical {
  width: 1px;
  height: 100%;
}

.portable-shell {
  position: absolute;
  width: min(76%, 340px);
  height: 78%;
  border: 1px solid var(--ui-text-dimmed);
  border-radius: 50%;
  transition: border-radius 200ms ease-out, transform 200ms ease-out;
}

.shell-outer {
  transform: rotate(-12deg);
}

.shell-inner {
  width: min(66%, 298px);
  height: 68%;
  border-color: var(--ui-border-accented);
  transform: rotate(12deg);
}

[data-shape='square'] .portable-shell {
  border-radius: 8px;
  transform: rotate(0deg);
}

[data-shape='cut'] .shell-outer {
  border-radius: 64px 8px 64px 8px;
  transform: rotate(8deg);
}

[data-shape='cut'] .shell-inner {
  border-radius: 8px 64px 8px 64px;
  transform: rotate(-8deg);
}

.portable-document {
  z-index: 1;
  width: clamp(140px, 32cqi, 176px);
  padding: 1rem;
  background: var(--ui-bg);
  border: 1px solid var(--ui-text-muted);
  border-radius: 4px;
  transform: rotate(-4deg);
}

.document-title,
.document-footer,
.context-label,
.constant-label,
.portable-controls,
.portable-caption {
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.document-title {
  color: var(--ui-text-highlighted);
}

.document-footer {
  margin-top: 0.875rem;
  color: var(--ui-text-muted);
}

.knowledge-pattern {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
  margin-top: 1rem;
}

.knowledge-line {
  display: block;
  height: 5px;
  grid-column: span 6;
  background: var(--ui-text-muted);
}

.line-2,
.line-7,
.line-11 {
  grid-column: span 4;
}

.line-3,
.line-8,
.line-12 {
  grid-column: span 2;
}

.line-5 {
  grid-column: span 3;
  background: var(--ui-primary);
}

.line-6 {
  grid-column: span 3;
}

.context-label,
.constant-label {
  position: absolute;
  padding: 0.25rem 0.5rem;
  color: var(--ui-text-muted);
  background: var(--ui-bg-muted);
}

.context-label {
  bottom: 1rem;
  left: 1rem;
}

.constant-label {
  top: 1rem;
  right: 1rem;
}

.portable-controls {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}

.portable-controls legend {
  padding: 0;
  margin-bottom: 0.75rem;
  color: var(--ui-text-muted);
}

.agent-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.agent-options button {
  min-height: 44px;
  padding: 0.5rem 0.875rem;
  color: var(--ui-text);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border-accented);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 200ms ease-out;
}

.agent-options button[aria-pressed='true'] {
  color: var(--ui-text-highlighted);
  border-color: var(--ui-primary);
  background: var(--ui-bg-muted);
}

.agent-options button:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}

.portable-caption {
  margin: 0.75rem 0 0;
  color: var(--ui-text-muted);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .portable-shell,
  .agent-options button {
    transition: none;
  }
}
</style>
