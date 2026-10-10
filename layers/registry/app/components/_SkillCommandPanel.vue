<script setup lang="ts">
import type { RunCheckFlag } from '#shared/run-check-flags'
import type { PnpmPackage } from '../../shared/pnpm-package'
import type { ZipState } from '../utils/skill-zip'
import SkillPnpmPackage from './_SkillPnpmPackage.vue'
import SkillRunFlag from './_SkillRunFlag.vue'
import SkillRunPrompt from './_SkillRunPrompt.vue'

type CommandMode = 'run' | 'install'
type InstallTarget = 'local' | 'claude' | 'chatgpt' | 'npm'

const {
  runUrl,
  installCommand,
  runCopied,
  installCopied,
  copyError,
  layout = 'tabs',
  zipName,
  zipState = { _tag: 'idle' },
  runFlag = null,
  sourceUrl = '',
  published = null,
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
  /** Set when the last two run checks failed for a reason a retry cannot change. */
  runFlag?: RunCheckFlag | null
  /** The SKILL.md on GitHub, which the run flag links. */
  sourceUrl?: string
  published?: Extract<PnpmPackage, { _tag: 'Found' }> | null
}>()

const emit = defineEmits<{
  copy: [mode: CommandMode]
  download: []
}>()

const installTarget = ref<InstallTarget>('local')
watch(() => published, (value) => {
  if (!value && installTarget.value === 'npm')
    installTarget.value = 'local'
})
const installTargets = computed(() => [
  { label: 'Terminal', value: 'local' },
  { label: 'Claude', value: 'claude' },
  { label: 'ChatGPT', value: 'chatgpt' },
  ...(published ? [{ label: 'npm', value: 'npm' as const }] : []),
] satisfies { label: string, value: InstallTarget }[])
// Where each web app takes an uploaded Skill ZIP.
const uploadSteps: Record<'claude' | 'chatgpt', string> = {
  claude: 'Upload it in Claude under Settings › Capabilities › Skills.',
  chatgpt: 'Upload it in ChatGPT under Skills › Create › Upload from your computer.',
}
// The next step past one Skill: let the same client search the whole registry.
const registrySetup: Record<InstallTarget, { to: string, label: string }> = {
  npm: { to: '/developers', label: 'Let your agent search the registry' },
  local: { to: '/developers', label: 'Let your agent search the registry' },
  claude: { to: '/developers?setup=mcp&app=claude', label: 'Search the registry from Claude' },
  chatgpt: { to: '/developers?setup=mcp&app=chatgpt', label: 'Search the registry from ChatGPT' },
}

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
const forkNoteId = useId()

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
    class="space-y-8"
  >
    <div class="space-y-2">
      <div class="space-y-1">
        <h2 class="font-mono text-sm text-default">
          Run once off
        </h2>
        <p class="text-xs leading-relaxed text-muted">
          Nothing lands on disk. Nothing to clean up.
        </p>
      </div>
      <div class="flex items-center gap-2 rounded-lg border border-default bg-muted py-1 pr-1 pl-3 text-xs">
        <SkillRunPrompt
          :url="runUrl"
          class="block min-w-0 flex-1 py-1"
        />
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
      <SkillRunFlag
        v-if="runFlag"
        :flag="runFlag"
        :source-url="sourceUrl"
      />
    </div>

    <div class="space-y-2">
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
            ? 'border-primary text-default'
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
        class="space-y-2 pt-1"
      >
        <template v-if="installTarget === 'local'">
          <p class="text-xs leading-relaxed text-muted">
            The files land in your project. The lockfile records them.
          </p>
          <div class="flex items-center gap-2 rounded-lg border border-default bg-muted py-1 pr-1 pl-3 text-xs">
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
        <SkillPnpmPackage v-else-if="installTarget === 'npm'" :published="published" />
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
      </div>
    </div>

    <ul
      role="list"
      class="font-mono text-xs"
    >
      <li>
        <NuxtLink
          :to="`${runUrl}.md?action=fork`"
          class="inline-flex min-h-9 items-center gap-2 text-default underline-offset-2 hover:underline"
          :aria-describedby="forkNoteId"
        >
          <UIcon
            name="i-lucide-git-fork"
            class="size-3.5"
            aria-hidden="true"
          />
          Fork this Skill
        </NuxtLink>
        <p
          :id="forkNoteId"
          class="pb-1 pl-5.5 font-sans leading-relaxed text-muted"
        >
          Edit a local copy. It keeps the author and licence.
        </p>
      </li>
      <li>
        <NuxtLink
          :to="registrySetup[installTarget].to"
          class="inline-flex min-h-9 items-center gap-2 text-default underline-offset-2 hover:underline"
        >
          <UIcon
            name="i-lucide-search"
            class="size-3.5"
            aria-hidden="true"
          />
          {{ registrySetup[installTarget].label }}
        </NuxtLink>
      </li>
    </ul>

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

    <div v-if="mode === 'install' && published" role="group" aria-label="Install source" class="flex gap-4">
      <button v-for="item in installTargets.filter(item => item.value === 'local' || item.value === 'npm')" :key="item.value" type="button" class="min-h-11 font-mono text-xs" :class="installTarget === item.value ? 'text-default underline underline-offset-4' : 'text-muted'" :aria-pressed="installTarget === item.value" @click="installTarget = item.value">
        {{ item.label }}
      </button>
    </div>
    <SkillPnpmPackage v-if="mode === 'install' && installTarget === 'npm' && published" :published="published" />
    <div v-else class="flex items-center gap-2 rounded-lg border border-default bg-muted py-1 pr-1 pl-3 text-sm">
      <SkillRunPrompt
        v-if="mode === 'run'"
        :url="runUrl"
        class="block min-w-0 flex-1 py-1"
      />
      <InstallCommand
        v-else
        :command="installCommand"
        wrap
        class="block min-w-0 flex-1 py-1"
      />
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
      Nothing lands on disk. Nothing to clean up.
    </p>
    <SkillRunFlag
      v-if="mode === 'run' && runFlag"
      :flag="runFlag"
      :source-url="sourceUrl"
    />

    <div class="text-xs">
      <NuxtLink
        :to="`${runUrl}.md?action=fork`"
        class="inline-flex min-h-11 items-center gap-2 font-mono text-default underline-offset-2 hover:underline"
        :aria-describedby="forkNoteId"
      >
        <UIcon
          name="i-lucide-git-fork"
          class="size-3.5"
          aria-hidden="true"
        />
        Fork this Skill
      </NuxtLink>
      <p
        :id="forkNoteId"
        class="pl-5.5 leading-relaxed text-muted"
      >
        Edit a local copy. It keeps the author and licence.
      </p>
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
</template>
