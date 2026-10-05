<script setup lang="ts">
/**
 * The board's time range, as real links.
 *
 * Not a JS toggle. Each range is its own document, so
 * a crawler has to be able to follow one. Rendered above every board state so
 * a reader who lands on an empty range can switch away from it. A column in
 * the sidebar on wide screens, a compact row above the board on narrow ones.
 */
const { options, current } = defineProps<{
  /** `label` is a short verb-free noun; `hint` says what the range covers, on wide screens. */
  options: readonly { id: string, label: string, hint: string, path: string }[]
  current: string
}>()

const headingId = useId()
</script>

<template>
  <h2 :id="headingId" class="range-heading">
    Time range
  </h2>
  <nav class="range-switcher" :aria-labelledby="headingId">
    <NuxtLink
      v-for="option in options"
      :key="option.id"
      :to="option.path"
      class="range-link"
      :class="{ 'range-link--current': option.id === current }"
      :aria-current="option.id === current ? 'page' : undefined"
    >
      <span>{{ option.label }}</span>
      <span class="range-link__hint">{{ option.hint }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* Narrow screens show the range row alone; the heading names it for assistive tech. */
.range-heading {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/*
 * One control with a position per range, rather than separate buttons. Mono
 * and border-driven, like every other control on the site; the current range
 * is marked by a raised surface, so nothing moves and no accent is spent on
 * navigation.
 */
.range-switcher {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) + 0.25rem);
}

.range-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding-inline: 1rem;
  border-radius: var(--ui-radius);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  transition: color 200ms, background-color 200ms;
}

@media (hover: hover) {
  .range-link:hover {
    color: var(--ui-text);
  }
}

.range-link--current {
  background: var(--ui-bg-elevated);
  box-shadow: inset 0 0 0 1px var(--ui-border);
  color: var(--ui-text-highlighted);
}

.range-link__hint {
  display: none;
}

/* Wide screens: a list with the window each range covers. */
@media (min-width: 64rem) {
  .range-heading {
    position: static;
    display: flex;
    align-items: center;
    inline-size: auto;
    block-size: auto;
    min-block-size: 1.75rem;
    margin-block-end: 0.5rem;
    overflow: visible;
    clip-path: none;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: var(--ui-text);
  }

  .range-switcher {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0;
    border: 0;
    border-radius: 0;
  }

  /* Set like the maintainer rows in the /skills sidebar: the name, then a mono line. */
  .range-link {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.375rem 0.5rem;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--ui-text-toned);
  }

  .range-link--current {
    box-shadow: none;
  }

  @media (hover: hover) {
    .range-link:hover {
      background: var(--ui-bg-elevated);
    }
  }

  .range-link__hint {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 400;
    line-height: 1rem;
    color: var(--ui-text-muted);
  }
}
</style>
