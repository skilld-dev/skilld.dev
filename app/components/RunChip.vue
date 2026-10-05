<script setup lang="ts">
import type { InstallCopyMode, InstallTarget } from '~/composables/useInstallCopy'
import { skillInstallCmd, skillRunCmd } from '#shared/skill-commands'
import CommandChip from './_CommandChip.vue'

/**
 * The run command for one Skill, with install as the opt-in.
 *
 * `switch` puts a run | install switch above the chip, with run preselected,
 * and a line below that says what the command does. Flipping the switch
 * changes the chip itself: install closes the dashes and fills the dot.
 * `compact` is the run chip alone, for list rows.
 */
const {
  owner,
  repo,
  skill,
  surface,
  variant = 'switch',
} = defineProps<{
  owner: string
  repo: string
  /** The Skill name, the last segment of `owner/repo/skill`. */
  skill: string
  /** The analytics surface, such as `trending-row`. */
  surface: string
  variant?: 'switch' | 'compact'
}>()

const CONSEQUENCE: Record<InstallCopyMode, string> = {
  run: 'Reads the Skill now. Writes nothing.',
  install: 'Adds the Skill files and a lockfile entry.',
}

const modes = [
  { value: 'run', label: 'run' },
  { value: 'install', label: 'install' },
] satisfies { value: InstallCopyMode, label: string }[]

const mode = ref<InstallCopyMode>('run')
const rootRef = ref<HTMLElement>()
const consequenceId = useId()

const command = computed(() => mode.value === 'install'
  ? skillInstallCmd(owner, repo, skill)
  : skillRunCmd(owner, repo, skill))
const target = computed<InstallTarget>(() => ({ kind: 'skill', owner, name: skill }))

function choose(next: InstallCopyMode) {
  if (next === mode.value)
    return
  mode.value = next
  // A fallback selection would now cover the other command, so drop it.
  const selection = window.getSelection()
  if (selection?.anchorNode && rootRef.value?.contains(selection.anchorNode))
    selection.removeAllRanges()
}
</script>

<template>
  <div
    v-if="variant === 'compact'"
    ref="rootRef"
    class="run-chip run-chip--compact"
  >
    <CommandChip
      :command="command"
      mode="run"
      size="sm"
      :surface="surface"
      :target="target"
      :described-by="consequenceId"
    />
    <span :id="consequenceId" class="sr-only">{{ CONSEQUENCE.run }}</span>
  </div>
  <div
    v-else
    ref="rootRef"
    class="run-chip"
  >
    <div class="run-chip__switch" role="group" aria-label="Command">
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        class="run-chip__option"
        :aria-pressed="mode === item.value"
        @click="choose(item.value)"
      >
        <span
          class="run-chip__legend"
          :class="item.value === 'install' && 'run-chip__legend--filled'"
          aria-hidden="true"
        />
        {{ item.label }}
      </button>
    </div>
    <CommandChip
      :command="command"
      :mode="mode"
      :surface="surface"
      :target="target"
      :described-by="consequenceId"
    />
    <p :id="consequenceId" class="run-chip__consequence" aria-live="polite">
      {{ CONSEQUENCE[mode] }}
    </p>
  </div>
</template>

<style scoped>
.run-chip {
  display: grid;
  gap: 0.625rem;
  justify-items: start;
  min-width: 0;
}

.run-chip > :deep(.command-chip) {
  justify-self: stretch;
}

.run-chip--compact {
  display: block;
}

.run-chip__switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ui-border-accented);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.run-chip__option {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  min-height: 1.875rem;
  padding: 0 0.75rem;
  border: 0;
  border-radius: calc(var(--ui-radius) - 2px);
  background: none;
  color: var(--ui-text-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 200ms ease-out, background-color 200ms ease-out;
}

@media (hover: hover) {
  .run-chip__option:hover {
    color: var(--ui-text);
  }
}

.run-chip__option[aria-pressed='true'] {
  background: var(--ui-bg-muted);
  color: var(--ui-text);
  font-weight: 500;
}

/* The same dots as the chip, in ink: a legend, so the chip keeps the only rose dot. */
.run-chip__legend {
  flex: none;
  width: 6px;
  height: 6px;
  border: 1.5px solid currentColor;
  border-radius: 999px;
}

.run-chip__legend--filled {
  background: currentColor;
}

.run-chip__consequence {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--ui-text-muted);
}

@media (pointer: coarse) {
  .run-chip__option {
    min-height: 2.75rem;
  }
}
</style>
