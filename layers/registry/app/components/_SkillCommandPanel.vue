<script setup lang="ts">
import { SKILL_RUN_PROMPT_LEAD } from '#shared/skill-commands'

type CommandMode = 'run' | 'install'

const {
  runUrl,
  installCommand,
  runCopied,
  installCopied,
  copyError,
  layout = 'tabs',
} = defineProps<{
  /** The Skill page. The Agent fetches it and receives the SKILL.md as markdown. */
  runUrl: string
  installCommand: string
  runCopied: boolean
  installCopied: boolean
  copyError: string
  /** `tabs` fits a narrow column. `stacked` shows run, then install as the opt-in. */
  layout?: 'tabs' | 'stacked'
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

// Stacked shows both commands, so the copy error follows the last click.
function copyFrom(next: CommandMode) {
  mode.value = next
  emit('copy', next)
}
</script>

<template>
  <div
    v-if="layout === 'stacked'"
    data-testid="skill-command-panel"
    class="space-y-6"
  >
    <div class="space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="font-mono text-sm text-default">
          Run
        </h2>
        <span class="data-label">this session</span>
      </div>
      <p class="text-xs leading-relaxed text-muted">
        Paste this into your agent. It reads the Skill now, and nothing lands on disk.
      </p>
      <div class="flex items-center gap-2 rounded-lg border border-default bg-muted py-1 pr-1 pl-3 text-sm">
        <p class="min-w-0 flex-1 py-1 leading-relaxed text-default">
          {{ SKILL_RUN_PROMPT_LEAD }} <code class="install-command install-command--wrap install-command__target inline">{{ runUrl }}</code>
        </p>
        <UButton
          :icon="runCopied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 min-w-11 shrink-0"
          :aria-label="runCopied ? 'Copied' : 'Copy Agent prompt'"
          :aria-describedby="copyError && mode === 'run' ? copyErrorId : undefined"
          @click="copyFrom('run')"
        />
      </div>
    </div>

    <div class="space-y-2 border-t border-default pt-5">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="font-mono text-sm text-default">
          Install
        </h2>
        <span class="data-label">every session</span>
      </div>
      <p class="text-xs leading-relaxed text-muted">
        The files land in your project, and the lockfile records them.
      </p>
      <div class="flex items-center gap-2 rounded-lg border border-default py-1 pr-1 pl-3 text-sm">
        <InstallCommand
          :command="installCommand"
          wrap
          class="block min-w-0 flex-1 py-1"
        />
        <UButton
          :icon="installCopied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 min-w-11 shrink-0"
          :aria-label="installCopied ? 'Copied' : 'Copy install command'"
          :aria-describedby="copyError && mode === 'install' ? copyErrorId : undefined"
          @click="copyFrom('install')"
        />
      </div>
      <AgentTargets />
    </div>

    <p
      v-if="copyError"
      :id="copyErrorId"
      aria-live="polite"
      class="text-sm leading-relaxed text-error"
    >
      {{ copyError }}
    </p>
  </div>
  <div
    v-else
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
