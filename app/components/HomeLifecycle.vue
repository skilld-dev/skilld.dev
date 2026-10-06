<script setup lang="ts">
/**
 * skilld in three steps, in the order a dev meets them: find a Skill, run
 * it (or fork or install it), then keep it up to date.
 *
 * Stone dots join the steps. Run, the default path, carries the band's one
 * rose dot.
 */
type StepId = 'find' | 'run' | 'update'

interface LifecycleStep {
  id: StepId
  name: string
  to: string
  text: string
}

/** The default path, and the band's one rose dot. */
const PICKED_STEP: StepId = 'run'

const steps: LifecycleStep[] = [
  {
    id: 'find',
    name: 'Find Skills',
    to: '/skills',
    text: 'Curated, plus what devs talk about.',
  },
  {
    id: 'run',
    name: 'Run, Fork or Install',
    to: '/cli#run',
    text: 'Run leaves nothing on disk. Fork or install to keep it.',
  },
  {
    id: 'update',
    name: 'Keep up to date',
    to: '/cli#update',
    text: 'Watch repos and get a digest when Skills change.',
  },
]
</script>

<template>
  <nav class="home-lifecycle" aria-label="What you can do here">
    <ol class="home-lifecycle__list mx-auto max-w-5xl px-4 sm:px-6">
      <li v-for="step in steps" :key="step.id" class="home-lifecycle__item">
        <NuxtLink :to="step.to" class="home-lifecycle__step">
          <span class="home-lifecycle__rail" aria-hidden="true">
            <span class="home-lifecycle__node" :class="{ 'home-lifecycle__node--picked': step.id === PICKED_STEP }" />
          </span>
          <span class="home-lifecycle__body">
            <span class="home-lifecycle__name">{{ step.name }}</span>
            <span class="home-lifecycle__text">{{ step.text }}</span>
          </span>
        </NuxtLink>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.home-lifecycle {
  --lifecycle-node: 0.5rem;
  --lifecycle-gap: 0.375rem;
  --lifecycle-pad-block: 0.625rem;
  --lifecycle-ring-room: 0.5rem;
  background: var(--ui-bg);
}

.home-lifecycle__list {
  display: grid;
  margin-block: 0;
  padding-block: 0.75rem;
  list-style: none;
}

.home-lifecycle__item {
  min-width: 0;
}

/* Phones and tablets: a vertical list. The rail runs down the left. */
.home-lifecycle__step {
  position: relative;
  display: grid;
  grid-template-columns: var(--lifecycle-node) minmax(0, 1fr);
  column-gap: 1rem;
  min-height: 2.75rem;
  /* The inline padding keeps the focus ring clear of the node. */
  margin-inline: calc(-1 * var(--lifecycle-ring-room));
  padding: var(--lifecycle-pad-block) var(--lifecycle-ring-room);
  color: inherit;
  text-decoration: none;
  border-radius: var(--ui-radius);
}

.home-lifecycle__rail {
  position: relative;
}

/* The node sits on the centre line of the step name. */
.home-lifecycle__node {
  position: absolute;
  top: calc((1.25rem - var(--lifecycle-node)) / 2);
  left: 0;
  width: var(--lifecycle-node);
  height: var(--lifecycle-node);
  border-radius: 999px;
  background: var(--ui-text-dimmed);
  transition: background-color 200ms ease-out;
}

.home-lifecycle__node--picked {
  background: var(--brand-dot);
}

/* Stone dots from this node down to the next one. */
.home-lifecycle__item:not(:last-child) .home-lifecycle__rail::after {
  content: '';
  position: absolute;
  top: calc((1.25rem + var(--lifecycle-node)) / 2 + var(--lifecycle-gap));
  bottom: calc(-2 * var(--lifecycle-pad-block) - (1.25rem - var(--lifecycle-node)) / 2 + var(--lifecycle-gap));
  left: 50%;
  width: 4px;
  transform: translateX(-50%);
  background-image: radial-gradient(circle, var(--ui-text-dimmed) 1.1px, transparent 1.4px);
  background-size: 4px 6px;
  background-repeat: repeat-y;
  opacity: 0.7;
}

.home-lifecycle__body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.home-lifecycle__name {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
  color: var(--ui-text-highlighted);
  text-decoration-line: underline;
  text-decoration-color: transparent;
  text-underline-offset: 0.25em;
  transition: text-decoration-color 200ms ease-out;
}

.home-lifecycle__text {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--ui-text-muted);
  text-wrap: pretty;
}

.home-lifecycle__step:hover .home-lifecycle__name,
.home-lifecycle__step:focus-visible .home-lifecycle__name {
  text-decoration-color: currentColor;
}

.home-lifecycle__step:hover .home-lifecycle__node:not(.home-lifecycle__node--picked),
.home-lifecycle__step:focus-visible .home-lifecycle__node:not(.home-lifecycle__node--picked) {
  background: var(--ui-text-muted);
}

.home-lifecycle__step:focus-visible {
  outline: 2px solid var(--ui-border-inverted);
  outline-offset: 2px;
}

/* Desktop: three centred columns on one line of stone dots. */
@media (min-width: 64rem) {
  .home-lifecycle {
    --lifecycle-pad-inline: 1rem;
  }

  .home-lifecycle__list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-block: 1rem;
  }

  .home-lifecycle__step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    height: 100%;
    margin-inline: 0;
    padding-inline: var(--lifecycle-pad-inline);
    text-align: center;
  }

  .home-lifecycle__rail {
    align-self: stretch;
    height: var(--lifecycle-node);
  }

  .home-lifecycle__node {
    top: 0;
    left: calc(50% - var(--lifecycle-node) / 2);
  }

  .home-lifecycle__text {
    text-wrap: balance;
  }

  /* Stone dots from this node across to the next column's node. The columns
     share one width, so the next node sits one column width to the right. */
  .home-lifecycle__item:not(:last-child) .home-lifecycle__rail::after {
    top: 50%;
    bottom: auto;
    left: calc(50% + var(--lifecycle-node) / 2 + var(--lifecycle-gap));
    right: calc(-50% - 2 * var(--lifecycle-pad-inline) + var(--lifecycle-node) / 2 + var(--lifecycle-gap));
    width: auto;
    height: 4px;
    transform: translateY(-50%);
    background-size: 6px 4px;
    background-repeat: repeat-x;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-lifecycle__node,
  .home-lifecycle__name {
    transition: none;
  }
}
</style>
