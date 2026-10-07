<script setup lang="ts">
import type { resolveSkillContextChecks } from '../utils/skill-context-checks'

const { result } = defineProps<{
  result: ReturnType<typeof resolveSkillContextChecks>
}>()

const hasError = computed(() => result.checks.some(check => check.tone === 'error'))
const hasDescriptionCap = computed(() => result.checks.some(check => check.code === 'codex-description-cap' || check.code === 'claude-description-cap'))
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
      <span v-if="hasError">SKILL.md has missing or invalid fields</span>
      <span v-else-if="hasDescriptionCap">An Agent shortens this description</span>
      <span v-else-if="result.checks.length && result.claudeListing._tag === 'listed'">Description uses {{ result.claudeListing.percent.toFixed(1) }}% of example budget</span>
      <span v-else>How this Skill uses context</span>
      <UIcon name="i-lucide-chevron-down" class="ml-auto size-3.5 shrink-0 group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div class="space-y-3 px-4 pb-3 font-sans text-sm sm:px-6">
      <p v-if="!hasError" class="text-default">
        Before choosing a Skill, your Agent reads its name and description.
        All available Skills share that space.
      </p>
      <ul v-if="result.checks.length" class="space-y-2" aria-label="Skill context checks">
        <li v-for="check in result.checks" :key="check.code" :class="check.tone === 'error' ? 'text-error-700 dark:text-error' : 'text-warning-800 dark:text-warning'">
          {{ check.message }}
        </li>
      </ul>
      <div v-if="result.claudeListing._tag === 'listed'" class="space-y-2 text-muted">
        <p>
          In our Claude Code example, all Skill names and descriptions share 8,000 characters.
          This Skill uses ≈{{ result.claudeListing.characters }} characters, or {{ result.claudeListing.percent.toFixed(1) }}%.
        </p>
        <p v-if="result.checks.some(check => check.code === 'listing-share')">
          The 1% threshold is a size suggestion. Longer descriptions can still fit.
        </p>
        <p>Your model, settings, and other Skills decide how much text your Agent can read.</p>
      </div>
      <p v-else-if="result.claudeListing._tag === 'explicit-only'" class="text-muted">
        This Skill turns off automatic use in Claude Code.
        Its description stays out of the automatic Skill list by default.
      </p>
      <details class="text-muted">
        <summary class="cursor-pointer text-xs font-mono">
          Example settings and source
        </summary>
        <p class="mt-2">
          The example uses a 200k-token context and default Claude Code settings.
          The count includes the name, description, separators, and when_to_use when present.
          Codex also counts local file paths.
        </p>
        <p class="mt-2 text-xs">
          <a href="https://github.com/smol-ai/skit/blob/08ff55d9d995b402ebd29c51bdedbe5690b9b0e0/docs/skill-context-budgets.md" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">Skit's source and limits</a>:
          Codex 0.160.1, Claude Code 2.1.292.
        </p>
      </details>
    </div>
  </details>
</template>
