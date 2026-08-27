<script setup lang="ts">
type CommandMode = 'run' | 'install'

const {
  runCommand,
  installCommand,
  runCopied,
  installCopied,
  docUrl,
  docUrlCopied,
  copyError,
} = defineProps<{
  runCommand: string
  installCommand: string
  runCopied: boolean
  installCopied: boolean
  docUrl: string
  docUrlCopied: boolean
  copyError: string
}>()

const emit = defineEmits<{
  copy: [mode: CommandMode]
  copyDocUrl: []
}>()

const mode = defineModel<CommandMode>({ required: true })

const modes = [
  { label: 'One-Off', value: 'run' },
  { label: 'Install', value: 'install' },
] satisfies { label: string, value: CommandMode }[]

const command = computed(() => mode.value === 'run' ? runCommand : installCommand)
const commandCopied = computed(() => mode.value === 'run' ? runCopied : installCopied)
const copyLabel = computed(() => commandCopied.value
  ? 'Copied'
  : mode.value === 'run' ? 'Copy Agent prompt' : 'Copy install command')
const description = computed(() => mode.value === 'run'
  ? 'Paste this prompt into your Agent. No Skill files are written.'
  : 'Keep the Skill available in future sessions.')
const copyErrorId = useId()
</script>

<template>
  <div
    data-testid="skill-command-panel"
    class="space-y-3 rounded-lg border border-default p-3 sm:p-4"
  >
    <div
      role="group"
      aria-label="Command type"
      class="grid grid-cols-2 rounded-lg bg-muted p-1"
    >
      <UButton
        v-for="item in modes"
        :key="item.value"
        :label="item.label"
        color="neutral"
        :variant="mode === item.value ? 'soft' : 'ghost'"
        size="sm"
        class="min-h-11 w-full justify-center rounded-md"
        :aria-pressed="mode === item.value"
        @click="mode = item.value"
      />
    </div>

    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1 rounded-md border border-default bg-muted px-3 py-2 text-sm">
        <p v-if="mode === 'run'" class="section-label mb-1">
          Ask your Agent
        </p>
        <p v-if="mode === 'run'" class="leading-relaxed text-default">
          Run <InstallCommand :command="command" wrap class="inline" /> and follow the loaded Skill instructions.
        </p>
        <InstallCommand v-else :command="command" wrap class="block" />
      </div>
      <UButton
        :icon="commandCopied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
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

    <p class="text-sm leading-relaxed text-muted">
      {{ description }}
    </p>

    <AgentTargets v-if="mode === 'install'" />

    <div class="flex items-center justify-end gap-1 border-t border-default pt-2">
      <a
        :href="docUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 items-center font-mono text-xs text-muted transition-colors hover:text-default"
      >Raw SKILL.md</a>
      <UButton
        :icon="docUrlCopied ? 'i-lucide-check' : 'i-lucide-link'"
        color="neutral"
        variant="ghost"
        size="xs"
        class="min-h-11 min-w-11"
        :aria-label="docUrlCopied ? 'Copied' : 'Copy the raw SKILL.md URL'"
        @click="emit('copyDocUrl')"
      />
    </div>
  </div>
</template>
