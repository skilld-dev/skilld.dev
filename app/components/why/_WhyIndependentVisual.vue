<script setup lang="ts">
import { TRENDING_SCORE_SOURCE_URL } from '~/utils/why-skilld'
import WhyPanel from './_WhyPanel.vue'

/**
 * The weights that rank every trending board, read from
 * `shared/trending-skill-score.ts` and `DEMOTED_STARRED_REPOSITORIES`. The
 * reason's own line and the trust line name who builds skilld, so the picture
 * spends its room on the weights.
 * If a weight there changes, change it here: this picture claims the code is
 * open, so it must match the code.
 */
interface Weight {
  signal: string
  detail?: string
  weight: string
  off?: boolean
}

const { compact = false } = defineProps<{
  /** Weights only, without the line under each. The homepage column uses it. */
  compact?: boolean
}>()

const WEIGHTS: Weight[] = [
  { signal: 'Each dev who posts about it', detail: 'a post naming 10 Skills gives each a tenth', weight: '×3' },
  { signal: 'Reach of those posts', detail: 'log scale; reposts ×3, bookmarks ×5', weight: '×3' },
  { signal: 'Star surge on a one-Skill repo', detail: 'log scale', weight: '×1' },
  { signal: 'The 20 most-starred repos', weight: 'after the rest' },
  { signal: 'Install counts', weight: '×0', off: true },
  { signal: 'Paid placement', weight: 'not sold', off: true },
]
</script>

<template>
  <WhyPanel label="skilld.dev/skills/trending">
    <table class="why-indie__weights">
      <caption class="sr-only">
        What ranks a Skill on the trending board, and how much
      </caption>
      <tbody>
        <tr v-for="row in WEIGHTS" :key="row.signal" :class="{ 'why-indie__off': row.off }">
          <th scope="row">
            <span class="why-indie__signal">{{ row.signal }}</span>
            <span v-if="row.detail && !compact" class="why-indie__detail">{{ row.detail }}</span>
          </th>
          <td>{{ row.weight }}</td>
        </tr>
      </tbody>
    </table>
    <a :href="TRENDING_SCORE_SOURCE_URL" target="_blank" rel="noopener" class="why-indie__code">
      Read the ranking code
      <UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" aria-hidden="true" />
    </a>
  </WhyPanel>
</template>

<style scoped>
.why-indie__weights {
  width: 100%;
  border-collapse: collapse;
}

.why-indie__weights th,
.why-indie__weights td {
  padding: 0.3125rem 0;
  vertical-align: baseline;
}

.why-indie__weights th {
  font-weight: 400;
  text-align: left;
}

.why-indie__signal {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text);
}

.why-indie__detail {
  display: block;
  color: var(--ui-text-dimmed);
}

.why-indie__weights td {
  padding-left: 0.75rem;
  white-space: nowrap;
  text-align: right;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  font-variant-numeric: tabular-nums;
}

.why-indie__off .why-indie__signal,
.why-indie__off td {
  color: var(--ui-text-muted);
}

.why-indie__code {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2rem;
  margin-top: auto;
  padding-top: 0.5rem;
  color: var(--ui-text);
  text-decoration-line: underline;
  text-decoration-color: var(--ui-border-accented);
  text-underline-offset: 0.2em;
}

.why-indie__code:hover {
  text-decoration-color: currentColor;
}
</style>
