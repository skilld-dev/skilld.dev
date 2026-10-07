<script setup lang="ts">
import { githubAvatarProxyUrl } from '#shared/image-proxy'

/**
 * What the homepage band does not draw, as one quiet line: who builds skilld,
 * the CLI claim from the hero, and that the Agents section reaches chat apps
 * and fetch-only agents with no shell. It ends on the route to the full
 * comparison. No rule above it: the tab list already closes on one.
 */
</script>

<template>
  <div class="why-trust">
    <ul class="why-trust__claims" aria-label="About skilld">
      <li>
        <a href="https://github.com/harlan-zw" target="_blank" rel="noopener" class="why-trust__maker">
          <img
            :src="githubAvatarProxyUrl('harlan-zw', 56)"
            alt=""
            width="28"
            height="28"
            loading="lazy"
            decoding="async"
            class="why-trust__avatar"
          >
          <span>Built by <span class="text-highlighted">Harlan Wilton</span></span>
        </a>
      </li>
      <li>
        <a href="https://github.com/skilld-dev/skilld" target="_blank" rel="noopener">Open-source CLI, no telemetry</a>
      </li>
      <li>
        <a href="#agents">Works without a terminal</a>
      </li>
    </ul>
    <UButton
      to="/vs/skills-sh"
      label="Compare with skills.sh"
      color="neutral"
      variant="outline"
      trailing-icon="i-lucide-arrow-right"
      class="min-h-11 shrink-0"
    />
  </div>
</template>

<style scoped>
.why-trust {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 2rem;
}

.why-trust__claims {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
}

.why-trust__claims > li {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  white-space: nowrap;
}

/* The two links keep a full touch target. */
.why-trust__claims a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
}

.why-trust__claims a:not(.why-trust__maker) {
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-trust__claims a:hover {
  color: var(--ui-text);
}

.why-trust__maker {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
}

.why-trust__avatar {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-muted);
}

/* Separators only where the line fits on one row, as in the hero claims line. */
@media (min-width: 64rem) {
  .why-trust__claims {
    column-gap: 0;
  }

  .why-trust__claims > li + li::before {
    content: '·';
    padding-inline: 0.75em;
    color: var(--ui-text-dimmed);
  }
}
</style>
