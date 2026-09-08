<script setup lang="ts">
import { projectSkillPrompt, projectSkillSource } from '../../utils/skill-kind'

const { copy, copied } = useClipboard()
const copyError = ref('')

async function copyInstructions() {
  copyError.value = ''
  await copy(projectSkillPrompt).catch(() => {
    copyError.value = 'Copy failed. Select and copy the instructions above.'
  })
}
</script>

<template>
  <div class="not-prose my-6 rounded-lg border border-default p-4 wrap-anywhere" data-testid="project-skill-setup">
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p class="min-w-0 font-mono text-sm text-highlighted">
        Project Skill
      </p>
      <UButton
        to="/make-skill"
        label="Change setup"
        color="neutral"
        variant="link"
        class="min-h-11 px-0 text-sm"
      />
    </div>
    <p class="mt-3 text-base leading-relaxed">
      Open your agent at the repository root. Give it these instructions to draft your Skill.
    </p>
    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton
        :label="copied ? 'Instructions copied' : 'Copy agent instructions'"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        class="min-h-11 hover:bg-primary-600 active:bg-primary-700"
        @click="copyInstructions"
      />
      <UButton
        :to="projectSkillSource"
        label="Read the authoring Skill"
        target="_blank"
        color="neutral"
        variant="link"
        class="min-h-11 px-0 text-sm"
      />
    </div>
    <p class="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-relaxed" data-testid="project-skill-prompt">
      {{ projectSkillPrompt }}
    </p>
    <p class="sr-only" aria-live="polite">
      {{ copied ? 'Instructions copied.' : '' }}
    </p>
    <p v-if="copyError" role="alert" class="mt-3 text-sm text-error">
      {{ copyError }}
    </p>
  </div>
</template>
