<script setup lang="ts">
import WhyPanel from './_WhyPanel.vue'

/**
 * What a Skill costs an Agent's context, by when each part loads, as the
 * Skill page counts and names it: four bytes per token. The name and description load
 * in every session, SKILL.md when the Agent uses the Skill, and the other
 * Markdown only when SKILL.md sends the Agent there. Scripts run, so only
 * their output lands. `anthropics/skills/pdf` as production listed it on
 * 2026-10-07. Each bar is drawn in stone dots, its length to scale.
 */
interface Stage {
  when: string
  what: string
  tokens: number
  label: string
}

const STAGES: Stage[] = [
  { when: 'Always', what: 'name and description', tokens: 111, label: '≈111' },
  { when: 'When used', what: 'SKILL.md', tokens: 1887, label: '≈1.9k' },
  { when: 'On demand', what: 'forms.md, reference.md', tokens: 7137, label: '≈7.1k' },
]

const MAX_TOKENS = Math.max(...STAGES.map(stage => stage.tokens))

function barWidth(tokens: number): string {
  // A floor, so the smallest stage still draws a dot or two.
  return `${Math.max(tokens / MAX_TOKENS * 100, 2.5)}%`
}
</script>

<template>
  <WhyPanel label="anthropics/skills/pdf · 11 files">
    <ul class="why-cost" aria-label="Tokens the pdf Skill adds to your agent's context">
      <li v-for="stage in STAGES" :key="stage.when" class="why-cost__stage">
        <span class="why-cost__head">
          <span class="why-cost__when">{{ stage.when }}</span>
          <span class="why-cost__tokens">{{ stage.label }} tokens</span>
        </span>
        <span class="why-cost__track" aria-hidden="true">
          <span class="why-cost__bar" :style="{ width: barWidth(stage.tokens) }" />
        </span>
        <span class="why-cost__what">{{ stage.what }}</span>
      </li>
    </ul>
    <p class="why-cost__scripts">
      <span>scripts/ · 8 files</span>
      <span>run, never read into context</span>
    </p>
  </WhyPanel>
</template>

<style scoped>
.why-cost {
  display: grid;
  gap: 0.875rem;
  margin: 0 0 0.875rem;
  padding: 0;
  list-style: none;
}

.why-cost__stage {
  display: grid;
  gap: 0.25rem;
}

.why-cost__head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.why-cost__when {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  color: var(--ui-text-highlighted);
}

.why-cost__tokens {
  margin-left: auto;
  color: var(--ui-text);
  font-variant-numeric: tabular-nums;
}

/* The brand atom: a bar is a run of stone dots, never a fill. */
.why-cost__track {
  display: block;
  height: 0.75rem;
}

.why-cost__bar {
  display: block;
  height: 100%;
  background-image: radial-gradient(circle, var(--ui-text-muted) 1.6px, transparent 1.9px);
  background-size: 6px 6px;
  background-position: 0 0;
}

.why-cost__what {
  color: var(--ui-text-dimmed);
}

.why-cost__scripts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  margin-top: auto;
  padding-top: 0.875rem;
  border-top: 1px dashed var(--ui-border);
  color: var(--ui-text-dimmed);
}

.why-cost__scripts > span:last-child {
  margin-left: auto;
}
</style>
