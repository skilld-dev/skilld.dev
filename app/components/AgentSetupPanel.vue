<script setup lang="ts">
import type { AgentTarget, SetupMode } from '~/utils/agents'

const { agent, command, docUrl } = defineProps<{
  agent: AgentTarget
  /** Base install command, without any agent or mode flags. */
  command: string
  /**
   * Public markdown URL the agent can read for one-off use. Omit it when the
   * surface has no such URL; the one-off mode is then hidden rather than
   * pointing at a dead link.
   */
  docUrl?: string
}>()

const emit = defineEmits<{
  copy: [payload: { value: string, agent: string, mode: SetupMode }]
}>()

const modes = computed<{ id: SetupMode, label: string }[]>(() => [
  { id: 'project', label: 'Project' },
  { id: 'global', label: 'Global' },
  ...(docUrl ? [{ id: 'once' as const, label: 'Use once' }] : []),
])

const mode = ref<SetupMode>('project')
const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

const value = computed(() => mode.value === 'once' && docUrl
  ? oncePromptFor(docUrl)
  : agentInstallCmd(command, agent.id, mode.value))

const where = computed(() => {
  if (mode.value === 'once')
    return 'Nothing is written to disk.'
  return mode.value === 'global'
    ? `Writes to ${agent.globalDir}/`
    : `Writes to ${agent.projectDir}/`
})

const hint = computed(() => mode.value === 'once'
  ? `Paste it into ${agent.label}. It reads the skill and follows it for this task only.`
  : agent.verify)

function onCopy() {
  emit('copy', { value: value.value, agent: agent.id, mode: mode.value })
  copied.value = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = false
  }, 2000)
}

// The panel is reused across agents inside the overflow popover, so a stale
// "Copied" tick would otherwise carry over to the next agent.
watch(() => agent.id, () => {
  copied.value = false
  clearTimeout(resetTimer)
})

onBeforeUnmount(() => clearTimeout(resetTimer))
</script>

<template>
  <div class="w-80 max-w-[calc(100vw-2rem)] p-3 space-y-3">
    <div class="flex items-center gap-2">
      <UIcon :name="agent.icon" class="size-4 text-muted" aria-hidden="true" />
      <p class="font-mono text-sm font-medium">
        {{ agent.label }}
      </p>
    </div>

    <div class="flex gap-1" role="group" :aria-label="`Setup mode for ${agent.label}`">
      <UButton
        v-for="option in modes"
        :key="option.id"
        :label="option.label"
        size="xs"
        :color="mode === option.id ? 'primary' : 'neutral'"
        :variant="mode === option.id ? 'subtle' : 'ghost'"
        :aria-pressed="mode === option.id"
        @click="mode = option.id"
      />
    </div>

    <div class="flex items-start gap-2">
      <code class="flex-1 min-w-0 break-all rounded-lg border border-default bg-muted px-2 py-1.5 font-mono text-xs leading-relaxed">{{ value }}</code>
      <UButton
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="outline"
        size="xs"
        :aria-label="copied ? 'Copied' : `Copy ${agent.label} setup command`"
        @click="onCopy"
      />
    </div>

    <p class="font-mono text-xs text-muted">
      {{ where }}
    </p>
    <p class="text-xs leading-relaxed text-muted">
      {{ hint }}
    </p>
    <span aria-live="polite" class="sr-only">{{ copied ? 'Copied to clipboard' : '' }}</span>
  </div>
</template>
