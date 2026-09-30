<script setup lang="ts">
import type { ZipState } from '../utils/skill-zip'
import { SKILL_RUN_PROMPT_LEAD } from '#shared/skill-commands'
import { AGENT_LOGOS } from '~/utils/agent-logos'

type CommandMode = 'run' | 'install'
type InstallTarget = 'local' | 'claude' | 'chatgpt'

const {
  runUrl,
  installCommand,
  runCopied,
  installCopied,
  copyError,
  layout = 'tabs',
  zipName,
  zipState = { _tag: 'idle' },
} = defineProps<{
  /** The Skill page. The Agent fetches it and receives the SKILL.md as markdown. */
  runUrl: string
  installCommand: string
  runCopied: boolean
  installCopied: boolean
  copyError: string
  /** `tabs` fits a narrow column. `stacked` shows run, then install as the opt-in. */
  layout?: 'tabs' | 'stacked'
  /** File name of the Skill ZIP for web agents. Unset hides the download. */
  zipName?: string
  zipState?: ZipState
}>()

const emit = defineEmits<{
  copy: [mode: CommandMode]
  download: []
}>()

const installTarget = ref<InstallTarget>('local')
const installTargets = [
  { label: 'Terminal', value: 'local' },
  { label: 'Claude', value: 'claude' },
  { label: 'ChatGPT', value: 'chatgpt' },
] satisfies { label: string, value: InstallTarget }[]
// Where each web app takes an uploaded Skill ZIP.
const uploadSteps: Record<Exclude<InstallTarget, 'local'>, string> = {
  claude: 'Upload it in Claude under Settings › Capabilities › Skills.',
  chatgpt: 'Upload it in ChatGPT under Skills › Create › Upload from your computer.',
}
// The next step past one Skill: let the same client search the whole registry.
const registrySetup: Record<InstallTarget, { to: string, label: string }> = {
  local: { to: '/developers', label: 'Let your Agent search the registry' },
  claude: { to: '/developers?setup=mcp&client=claude', label: 'Search the registry from Claude' },
  chatgpt: { to: '/developers?setup=mcp&client=chatgpt', label: 'Search the registry from ChatGPT' },
}
const agentNames = AGENT_LOGOS.map(agent => agent.label).join(', ')

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
const installPanelId = useId()

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
    <div class="flex items-center gap-2">
      <div
        role="img"
        class="skill-agent-stack"
        :aria-label="`Works with ${agentNames}`"
      >
        <span
          v-for="agent in AGENT_LOGOS"
          :key="agent.id"
          :title="agent.label"
        >
          <UIcon
            :name="agent.icon"
            class="size-3"
            aria-hidden="true"
          />
        </span>
      </div>
      <span
        class="data-label"
        aria-hidden="true"
      >Works with your agent</span>
    </div>

    <div class="space-y-3">
      <div class="space-y-1">
        <h2 class="font-mono text-sm text-default">
          Run once off
        </h2>
        <p class="text-xs leading-relaxed text-muted">
          <strong class="font-medium text-default">This session only.</strong> Nothing lands on disk. Nothing to clean up.
        </p>
      </div>
      <p class="rounded-lg border border-default bg-muted px-3 py-2 text-sm leading-relaxed text-default">
        {{ SKILL_RUN_PROMPT_LEAD }} <code class="install-command install-command--wrap install-command__target inline">{{ runUrl }}</code>
      </p>
      <UButton
        :icon="runCopied ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="runCopied ? 'Copied' : 'Copy prompt'"
        color="neutral"
        variant="outline"
        size="sm"
        class="font-mono"
        :aria-describedby="copyError && mode === 'run' ? copyErrorId : undefined"
        @click="copyFrom('run')"
      />
    </div>

    <div class="space-y-3 border-t border-default pt-6">
      <h2 class="font-mono text-sm text-default">
        Install as a Skill
      </h2>
      <div
        role="group"
        aria-label="Where you use it"
        class="flex gap-4 border-b border-default"
      >
        <button
          v-for="item in installTargets"
          :key="item.value"
          type="button"
          class="-mb-px min-h-9 border-b font-mono text-xs transition-colors"
          :class="installTarget === item.value
            ? 'border-[var(--ui-text)] text-default'
            : 'border-transparent text-muted hover:text-default'"
          :aria-pressed="installTarget === item.value"
          :aria-controls="installPanelId"
          @click="installTarget = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <div
        :id="installPanelId"
        class="space-y-3"
      >
        <template v-if="installTarget === 'local'">
          <p class="text-xs leading-relaxed text-muted">
            The files land in your project. The lockfile records them.
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
        </template>
        <template v-else>
          <p class="text-xs leading-relaxed text-muted">
            Download the ZIP. {{ uploadSteps[installTarget] }}
          </p>
          <UButton
            v-if="zipName"
            :icon="zipState._tag === 'building' ? 'i-lucide-loader-circle' : 'i-lucide-download'"
            :label="zipState._tag === 'building' ? `Packing ${zipState.done} of ${zipState.total} files` : `Download ${zipName}`"
            :loading="false"
            :disabled="zipState._tag === 'building'"
            color="neutral"
            variant="outline"
            size="sm"
            class="font-mono"
            :ui="{ leadingIcon: zipState._tag === 'building' ? 'animate-spin' : '' }"
            @click="emit('download')"
          />
          <p
            v-if="zipState._tag === 'error'"
            aria-live="polite"
            class="text-xs leading-relaxed text-error"
          >
            {{ zipState.message }}
          </p>
        </template>
        <NuxtLink
          :to="registrySetup[installTarget].to"
          class="inline-flex min-h-11 items-center text-xs text-muted underline underline-offset-2 hover:text-default"
        >
          {{ registrySetup[installTarget].label }}
        </NuxtLink>
      </div>
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
        class="-mb-px min-h-11 min-w-11 border-b font-mono text-xs transition-colors"
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
      v-if="mode === 'run'"
      class="text-xs leading-relaxed text-muted"
    >
      <strong class="font-medium text-default">This session only.</strong> Nothing lands on disk.
    </p>

    <p
      v-if="copyError"
      :id="copyErrorId"
      aria-live="polite"
      class="text-sm leading-relaxed text-error"
    >
      {{ copyError }}
    </p>
  </div>
</template>

<style scoped>
/* Overlapping monochrome marks, so the row reads as "every agent" without
   pulling focus from the commands. */
.skill-agent-stack {
  display: flex;
}
.skill-agent-stack > span {
  display: grid;
  place-items: center;
  width: 1.375rem;
  height: 1.375rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
}
.skill-agent-stack > span + span {
  margin-left: -0.375rem;
}
</style>
