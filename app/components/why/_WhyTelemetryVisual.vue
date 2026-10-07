<script setup lang="ts">
import WhyPanel from './_WhyPanel.vue'

/**
 * The CLI's own promise, quoted from its README, with the licence beside it.
 * A quote rather than our paraphrase, so a reader can check it at the source.
 */
const REPOSITORY_URL = 'https://github.com/skilld-dev/skilld'
</script>

<template>
  <WhyPanel label="skilld-dev/skilld · README.md">
    <ul class="why-telemetry__facts" aria-label="About the CLI">
      <li>
        <UIcon name="i-lucide-scale" class="size-3.5 shrink-0" aria-hidden="true" />
        MIT licence
      </li>
      <li>
        <UIcon name="i-lucide-code" class="size-3.5 shrink-0" aria-hidden="true" />
        Source on GitHub
      </li>
    </ul>
    <blockquote class="why-telemetry__quote">
      The skilld CLI sends no telemetry or analytics.
    </blockquote>
    <table class="why-telemetry__table">
      <caption class="sr-only">
        CLI telemetry, side by side
      </caption>
      <thead>
        <tr>
          <th scope="col">
            CLI
          </th>
          <th scope="col">
            Telemetry
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">
            skills
          </th>
          <td>on by default, <code>DISABLE_TELEMETRY=1</code> to stop</td>
        </tr>
        <tr>
          <th scope="row">
            skilld
          </th>
          <td class="why-telemetry__none">
            none, nothing to turn off
          </td>
        </tr>
      </tbody>
    </table>
    <a :href="REPOSITORY_URL" target="_blank" rel="noopener" class="why-telemetry__link">
      Read the source
      <UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
    </a>
  </WhyPanel>
</template>

<style scoped>
.why-telemetry__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.why-telemetry__facts li {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.5rem;
  padding: 0 0.5rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.75);
  color: var(--ui-text-muted);
}

.why-telemetry__quote {
  margin: 0.875rem 0 0;
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
  color: var(--ui-text-highlighted);
  text-wrap: balance;
}

.why-telemetry__table {
  width: 100%;
  margin-top: 0.875rem;
  border-top: 1px dashed var(--ui-border);
  border-collapse: collapse;
}

.why-telemetry__table th,
.why-telemetry__table td {
  padding: 0.375rem 0;
  text-align: left;
  vertical-align: top;
}

.why-telemetry__table thead th {
  padding-top: 0.75rem;
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.why-telemetry__table tbody th {
  width: 4.5rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}

.why-telemetry__table td {
  color: var(--ui-text-muted);
}

.why-telemetry__table code {
  color: var(--ui-text);
}

.why-telemetry__table td.why-telemetry__none {
  color: var(--ui-text-highlighted);
}

.why-telemetry__link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
  margin-top: 0.25rem;
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-telemetry__link:hover {
  text-decoration-color: currentColor;
}
</style>
