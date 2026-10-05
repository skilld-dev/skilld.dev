<script setup lang="ts">
import { skillOutdatedCmd } from '#shared/skill-commands'

/**
 * The whole of skilld in six steps, in the order a dev meets them: the site
 * finds Skills, the CLI runs, installs and updates them, and the last two
 * steps make and build on them.
 *
 * Stone dots join the steps. Run, the default path, carries the band's one
 * rose dot. The order is real, so the steps carry sequence markers.
 */
type StepId = 'find' | 'run' | 'install' | 'update' | 'make' | 'build'

interface LifecycleStep {
  id: StepId
  name: string
  to: string
  /** An approved pitch line from COPY.md. It leads the description in ink. */
  pitch?: string
  text: string
  /** A CLI command printed after the text. It comes from `shared/skill-commands.ts`, so the grammar gate checks it. */
  command?: string
}

/** The default path, and the band's one rose dot. */
const PICKED_STEP: StepId = 'run'

const steps: LifecycleStep[] = [
  {
    id: 'find',
    name: 'Find',
    to: '/skills/trending',
    pitch: 'Stay hyped.',
    text: 'A curated registry, plus what devs talk about on X and Bluesky.',
  },
  {
    id: 'run',
    name: 'Run',
    to: '/cli#run',
    pitch: 'No more skill bloat.',
    text: 'Your Agent reads the Skill now. Nothing lands on disk.',
  },
  {
    id: 'install',
    name: 'Install or fork',
    to: '/cli#install',
    // 19 is AGENT_TARGETS in the CLI's crates/skilld-core/src/target.rs.
    text: 'One install writes to 19 Agents, pinned to a commit and checked before files land. Fork for an editable copy.',
  },
  {
    id: 'update',
    name: 'Keep current',
    to: '/cli#update',
    pitch: 'Keep updated.',
    text: 'Watch repos and get a digest when their Skills change, or run',
    command: skillOutdatedCmd(),
  },
  {
    id: 'make',
    name: 'Make',
    to: '/make-skill',
    // generate-package-skill, generate-project-skill and review-skill.
    text: 'Guides and three authoring Skills to write and review your own.',
  },
  {
    id: 'build',
    name: 'Build on',
    to: '/developers',
    pitch: 'Built to be built on.',
    text: 'CLI, API, SDK, MCP and the Claude Code plugin.',
  },
]

function marker(index: number): string {
  return String(index + 1).padStart(2, '0')
}
</script>

<template>
  <nav class="home-lifecycle" aria-label="What you can do here">
    <ol class="home-lifecycle__list mx-auto max-w-6xl px-4 sm:px-6">
      <li v-for="(step, index) in steps" :key="step.id" class="home-lifecycle__item">
        <NuxtLink :to="step.to" class="home-lifecycle__step">
          <span class="home-lifecycle__rail" aria-hidden="true">
            <span class="home-lifecycle__node" :class="{ 'home-lifecycle__node--picked': step.id === PICKED_STEP }" />
          </span>
          <span class="home-lifecycle__body">
            <span class="home-lifecycle__head">
              <span class="home-lifecycle__marker" aria-hidden="true">{{ marker(index) }}</span>
              <span class="home-lifecycle__name">{{ step.name }}</span>
            </span>
            <span class="home-lifecycle__text">
              <template v-if="step.pitch">
                <span class="home-lifecycle__pitch">{{ step.pitch }}</span>{{ ' ' }}
              </template>{{ step.text }}<template v-if="step.command">
                {{ ' ' }}<code class="home-lifecycle__command">{{ step.command }}</code>.
              </template>
            </span>
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

.home-lifecycle__head {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  font-family: var(--font-mono);
  line-height: 1.25rem;
}

.home-lifecycle__marker {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-dimmed);
}

.home-lifecycle__name {
  font-size: 0.875rem;
  font-weight: 500;
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

.home-lifecycle__pitch {
  font-weight: 500;
  color: var(--ui-text);
}

.home-lifecycle__command {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text);
  white-space: nowrap;
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

/* Desktop: six columns on one line of stone dots. */
@media (min-width: 64rem) {
  .home-lifecycle {
    --lifecycle-pad-end: 1.25rem;
  }

  .home-lifecycle__list {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    padding-block: 1rem;
  }

  .home-lifecycle__step {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    /* The margin stops the focus ring short of the next node. */
    margin-inline-end: calc(var(--lifecycle-pad-end) - var(--lifecycle-ring-room));
  }

  .home-lifecycle__rail {
    height: var(--lifecycle-node);
  }

  .home-lifecycle__node {
    top: 0;
  }

  /* Stone dots from this node across to the next column's node. */
  .home-lifecycle__item:not(:last-child) .home-lifecycle__rail::after {
    top: 50%;
    bottom: auto;
    left: calc(var(--lifecycle-node) + var(--lifecycle-gap));
    right: calc(var(--lifecycle-gap) - var(--lifecycle-pad-end));
    width: auto;
    height: 4px;
    transform: translateY(-50%);
    background-size: 6px 4px;
    background-repeat: repeat-x;
  }
}

/* Narrow desktops: "Install or fork" stays on one line. */
@media (min-width: 64rem) and (max-width: 79.999rem) {
  .home-lifecycle {
    --lifecycle-pad-end: 1rem;
  }

  .home-lifecycle__head {
    gap: 0.5rem;
  }

  .home-lifecycle__name {
    font-size: 0.8125rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-lifecycle__node,
  .home-lifecycle__name {
    transition: none;
  }
}
</style>
