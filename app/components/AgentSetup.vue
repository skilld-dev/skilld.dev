<script setup lang="ts">
import type { InstallTarget } from '~/composables/useInstallCopy'
import type { AgentTarget, SetupMode } from '~/utils/agents'

const { command, docUrl, target, surface } = defineProps<{
  /** Base install command, without any agent or mode flags. */
  command: string
  /**
   * Public markdown URL an agent can read for one-off use. Only skill pages
   * have one: /api/skills-raw serves the SKILL.md, but there is no equivalent
   * for a collection, so the one-off affordance is hidden there.
   */
  docUrl?: string
  target: InstallTarget
  surface: string
}>()

const { copy } = useInstallCopy(() => command, surface, () => target)

// SkillDetail renders this component twice (mobile and rail), so the group
// label needs a unique id per instance.
const labelId = useId()

const overflowOpen = ref(false)
const selected = ref<AgentTarget | null>(null)
const onceCopied = ref(false)
let onceTimer: ReturnType<typeof setTimeout> | undefined

const oncePrompt = computed(() => docUrl ? oncePromptFor(docUrl) : '')

function onPanelCopy(payload: { value: string, agent: string, mode: SetupMode }) {
  void copy(payload.value, { agent: payload.agent, mode: payload.mode })
}

function copyOnce() {
  void copy(oncePrompt.value, { agent: 'any', mode: 'once' })
  onceCopied.value = true
  clearTimeout(onceTimer)
  onceTimer = setTimeout(() => {
    onceCopied.value = false
  }, 2000)
}

// Reopening the overflow should start at the agent list, not at whichever
// agent was inspected last.
watch(overflowOpen, (open) => {
  if (!open)
    selected.value = null
})

onBeforeUnmount(() => clearTimeout(onceTimer))
</script>

<template>
  <!-- No border of its own: every surface nests this inside a bordered install
       card, and the design system forbids a card inside a card. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-default pt-2">
    <p :id="labelId" class="font-mono text-xs text-muted">
      Set up your agent
    </p>

    <div class="flex items-center gap-1" role="group" :aria-labelledby="labelId">
      <UPopover v-for="agent in FEATURED_AGENT_TARGETS" :key="agent.id" :content="{ align: 'start' }">
        <UButton
          :icon="agent.icon"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 min-w-11 justify-center sm:min-h-9 sm:min-w-9"
          :aria-label="`Set up ${agent.label}`"
        />
        <template #content>
          <AgentSetupPanel
            :agent="agent"
            :command="command"
            :doc-url="docUrl"
            @copy="onPanelCopy"
          />
        </template>
      </UPopover>

      <UPopover v-model:open="overflowOpen" :content="{ align: 'start' }">
        <UButton
          :label="`+${OVERFLOW_AGENT_TARGETS.length}`"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 justify-center font-mono sm:min-h-9"
          :aria-label="`Show ${OVERFLOW_AGENT_TARGETS.length} more agents`"
        />
        <template #content>
          <AgentSetupPanel
            v-if="selected"
            :agent="selected"
            :command="command"
            :doc-url="docUrl"
            @copy="onPanelCopy"
          />
          <div v-if="selected" class="border-t border-default p-2">
            <UButton
              label="All agents"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="selected = null"
            />
          </div>
          <div v-else class="w-64 max-w-[calc(100vw-2rem)] p-1">
            <UButton
              v-for="agent in OVERFLOW_AGENT_TARGETS"
              :key="agent.id"
              :icon="agent.icon"
              :label="agent.label"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              class="justify-start font-mono"
              @click="selected = agent"
            />
          </div>
        </template>
      </UPopover>
    </div>

    <UPopover v-if="docUrl" :content="{ align: 'start' }">
      <UButton
        label="Use once"
        icon="i-lucide-clipboard-type"
        color="neutral"
        variant="ghost"
        size="xs"
        class="font-mono"
      />
      <template #content>
        <div class="w-80 max-w-[calc(100vw-2rem)] p-3 space-y-3">
          <p class="font-mono text-sm font-medium">
            Use once, no install
          </p>
          <div class="flex items-start gap-2">
            <code class="flex-1 min-w-0 break-all rounded-lg border border-default bg-muted px-2 py-1.5 font-mono text-xs leading-relaxed">{{ oncePrompt }}</code>
            <UButton
              :icon="onceCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              color="neutral"
              variant="outline"
              size="xs"
              :aria-label="onceCopied ? 'Copied' : 'Copy the use once prompt'"
              @click="copyOnce"
            />
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Paste it into any agent, including Claude and ChatGPT in the browser. The agent reads the skill and follows it for this task only.
          </p>
          <span aria-live="polite" class="sr-only">{{ onceCopied ? 'Copied to clipboard' : '' }}</span>
        </div>
      </template>
    </UPopover>
  </div>
</template>
