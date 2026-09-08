<script setup lang="ts">
import { SKILL_RUN_PROMPT_LEAD } from '#shared/skill-commands'

type CommandMode = 'run' | 'install'

const {
  runUrl,
  installCommand,
  runCopied,
  installCopied,
  copyError,
} = defineProps<{
  /** The Skill page. The Agent fetches it and receives the SKILL.md as markdown. */
  runUrl: string
  installCommand: string
  runCopied: boolean
  installCopied: boolean
  copyError: string
}>()

const emit = defineEmits<{
  copy: [mode: CommandMode]
}>()

const mode = defineModel<CommandMode>({ required: true })

const modes = [
  { label: 'Run', value: 'run' },
  { label: 'Install', value: 'install' },
] satisfies { label: string, value: CommandMode }[]

const commandCopied = computed(() => mode.value === 'run' ? runCopied : installCopied)
const copyLabel = computed(() => commandCopied.value
  ? 'Copied'
  : mode.value === 'run' ? 'Copy Agent prompt' : 'Copy install command')
const copyErrorId = useId()
</script>

<template>
  <div
    data-testid="skill-command-panel"
    class="space-y-2"
  >
    <div
      role="group"
      aria-label="Command type"
      class="flex gap-4 border-b border-default"
    >
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        class="-mb-px min-h-11 border-b font-mono text-xs transition-colors"
        :class="mode === item.value
          ? 'border-primary text-default'
          : 'border-transparent text-muted hover:text-default'"
        :aria-pressed="mode === item.value"
        @click="mode = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="flex items-center gap-2 rounded-lg border border-default bg-muted py-1 pr-1 pl-3 text-sm">
      <div class="min-w-0 flex-1 py-1">
        <p v-if="mode === 'run'" class="section-label mb-1">
          Ask your Agent
        </p>
        <p v-if="mode === 'run'" class="leading-relaxed text-default">
          {{ SKILL_RUN_PROMPT_LEAD }} <code class="install-command install-command--wrap install-command__target inline">{{ runUrl }}</code>
        </p>
        <InstallCommand v-else :command="installCommand" wrap class="block" />
      </div>
      <UButton
        :icon="commandCopied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="ghost"
        size="sm"
        class="min-h-11 min-w-11 shrink-0"
        :aria-label="copyLabel"
        :aria-describedby="copyError ? copyErrorId : undefined"
        @click="emit('copy', mode)"
      />
    </div>

    <p
      v-if="copyError"
      :id="copyErrorId"
      aria-live="polite"
      class="text-sm leading-relaxed text-error"
    >
      {{ copyError }}
    </p>

    <AgentTargets v-if="mode === 'install'" />
  </div>
</template>
