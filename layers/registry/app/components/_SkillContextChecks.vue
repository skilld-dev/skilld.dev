<script setup lang="ts">
import type { resolveSkillContextChecks } from '../utils/skill-context-checks'

defineProps<{
  result: ReturnType<typeof resolveSkillContextChecks>
}>()
</script>

<template>
  <div class="border-b border-default px-4 py-3 font-mono text-xs sm:px-6">
    <p v-if="result.claudeListing._tag === 'listed'" class="text-muted">
      Claude Code listing: ≈{{ result.claudeListing.characters }} characters,
      {{ result.claudeListing.percent.toFixed(1) }}% of an 8,000-character example allowance.
    </p>
    <p v-else-if="result.claudeListing._tag === 'explicit-only'" class="text-muted">
      Claude Code: disable-model-invocation keeps this Skill out of the automatic listing by default.
    </p>
    <ul v-if="result.checks.length" class="mt-2 space-y-2" aria-label="Skill context checks">
      <li v-for="check in result.checks" :key="check.code" class="flex items-start gap-2" :class="check.tone === 'error' ? 'text-error-700 dark:text-error' : 'text-warning-800 dark:text-warning'">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ check.message }}</span>
      </li>
    </ul>
    <p class="mt-2 text-muted">
      Example: 200k context tokens, default settings. Your model, settings, and other Skills change the allowance.
      Codex listing costs also include local file paths.
      <a href="https://github.com/smol-ai/skit/blob/08ff55d9d995b402ebd29c51bdedbe5690b9b0e0/docs/skill-context-budgets.md" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">Source and limits</a>:
      Codex 0.160.1, Claude Code 2.1.292.
    </p>
  </div>
</template>
