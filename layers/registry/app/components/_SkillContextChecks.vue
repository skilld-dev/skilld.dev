<script setup lang="ts">
import type { resolveSkillContextChecks } from '../utils/skill-context-checks'

const { result } = defineProps<{
  result: ReturnType<typeof resolveSkillContextChecks>
}>()

const hasError = computed(() => result.checks.some(check => check.tone === 'error'))
</script>

<template>
  <details class="group border-b border-default font-mono text-xs">
    <summary
      class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 focus-visible:outline-2 focus-visible:outline-primary sm:px-6 [&::-webkit-details-marker]:hidden"
      :class="hasError ? 'text-error-700 dark:text-error' : result.checks.length ? 'text-warning-800 dark:text-warning' : 'text-muted'"
    >
      <UIcon
        :name="result.checks.length ? 'i-lucide-triangle-alert' : 'i-lucide-info'"
        class="size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span v-if="hasError">Metadata needs a fix</span>
      <span v-else-if="result.checks.length">{{ result.checks.length }} context {{ result.checks.length === 1 ? 'warning' : 'warnings' }}</span>
      <span v-else>Context details</span>
      <UIcon name="i-lucide-chevron-down" class="ml-auto size-3.5 shrink-0 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div class="space-y-2 px-4 pb-3 sm:px-6">
      <ul v-if="result.checks.length" class="space-y-2" aria-label="Skill context checks">
        <li v-for="check in result.checks" :key="check.code" :class="check.tone === 'error' ? 'text-error-700 dark:text-error' : 'text-warning-800 dark:text-warning'">
          {{ check.message }}
        </li>
      </ul>
      <p v-if="result.claudeListing._tag === 'listed'" class="text-muted">
        Claude Code listing: ≈{{ result.claudeListing.characters }} characters,
        {{ result.claudeListing.percent.toFixed(1) }}% of an 8,000-character example allowance.
      </p>
      <p v-else-if="result.claudeListing._tag === 'explicit-only'" class="text-muted">
        Claude Code: disable-model-invocation keeps this Skill out of the automatic listing by default.
      </p>
      <p class="text-muted">
        Example: 200k context tokens, default settings. Your model, settings, and other Skills change the allowance.
        Codex listing costs also include local file paths.
        <a href="https://github.com/smol-ai/skit/blob/08ff55d9d995b402ebd29c51bdedbe5690b9b0e0/docs/skill-context-budgets.md" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">Source and limits</a>:
        Codex 0.160.1, Claude Code 2.1.292.
      </p>
    </div>
  </details>
</template>
