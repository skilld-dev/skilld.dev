<script setup lang="ts">
import type { SkillCardView } from '~/types/skill-card'

/**
 * The run command as a card offers it: the word `run` in the run chip's
 * material, dashes and a hollow dot, because a run leaves nothing behind.
 * The full command lives in its title and accessible name, and the click
 * copies it.
 *
 * The dot stays stone until a visitor reaches for it, so a grid of cards
 * spends no rose at rest.
 */
const { run, title } = defineProps<{
  run: NonNullable<SkillCardView['run']>
  /** `/name`, for the accessible name. */
  title: string
}>()

const marching = ref(false)

async function onCopy() {
  run.copy()
  // Restart the march if a second copy lands before the first one ends.
  marching.value = false
  await nextTick()
  requestAnimationFrame(() => {
    marching.value = true
  })
}
</script>

<template>
  <button
    type="button"
    class="skill-run"
    :class="[run.copied && 'skill-run--copied', marching && 'skill-run--march']"
    :title="run.command"
    @click.stop.prevent="onCopy"
  >
    <svg class="skill-run__edge" aria-hidden="true" focusable="false">
      <rect width="100%" height="100%" rx="7.5" ry="7.5" @animationend="marching = false" />
    </svg>
    <span class="skill-run__dot" aria-hidden="true" />
    <span aria-hidden="true">{{ run.copied ? 'copied' : 'run' }}</span>
    <span class="sr-only">Copy run command for {{ title }}</span>
    <span class="sr-only" aria-live="polite">{{ run.copied ? 'Copied.' : '' }}</span>
  </button>
</template>

<style scoped>
.skill-run {
  --skill-run-dot: var(--ui-text-dimmed);

  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.375rem;
  min-block-size: 1.75rem;
  padding-inline: 0.5rem;
  border: 0;
  border-radius: var(--ui-radius);
  background: none;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background-color 200ms ease-out, color 200ms ease-out;
}

/* Reaching for the command lights the dot. */
@media (hover: hover) {
  .skill-run:hover {
    --skill-run-dot: var(--brand-dot);

    background: var(--ui-bg-muted);
    color: var(--ui-text);
  }
}

.skill-run:focus-visible,
.skill-run--copied {
  --skill-run-dot: var(--brand-dot);

  color: var(--ui-text);
}

.skill-run:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
}

.skill-run__edge {
  position: absolute;
  inset: 0.5px;
  inline-size: calc(100% - 1px);
  block-size: calc(100% - 1px);
  overflow: visible;
  pointer-events: none;
}

.skill-run__edge rect {
  fill: none;
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.skill-run--march .skill-run__edge rect {
  animation: skill-run-march 600ms linear;
}

@keyframes skill-run-march {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -14;
  }
}

.skill-run__dot {
  flex: none;
  inline-size: 6px;
  block-size: 6px;
  border: 1.5px solid var(--skill-run-dot);
  border-radius: 999px;
  transition: border-color 200ms ease-out;
}

@media (pointer: coarse) {
  .skill-run {
    min-block-size: 2.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skill-run,
  .skill-run__dot {
    transition: none;
  }

  .skill-run--march .skill-run__edge rect {
    animation: none;
  }
}
</style>
