<script setup lang="ts">
import type { InstallTarget } from '~/composables/useInstallCopy'
import { cliGlobalInstallCmd, cliNativeInstallCmd, cliWindowsInstallCmd } from '#shared/skill-commands'
import ChipSwitch from './_ChipSwitch.vue'
import CommandChip from './_CommandChip.vue'

/**
 * The solid install chip for the CLI itself. It sits beside
 * `SkilldInstallChip` on the `/cli` page, which teaches the Agent to drive
 * what this one installs.
 *
 * A platform switch sits above it, with the native installer preselected: that
 * install upgrades itself, and an npm install waits for npm to upgrade it.
 */
const { surface, quiet = false } = defineProps<{
  /** The analytics surface, such as `cli-hero`. */
  surface: string
  /** Ink the dot instead of rose, where another element already spends the band's rose. */
  quiet?: boolean
}>()

type Platform = 'unix' | 'windows' | 'npm'

const NATIVE_CONSEQUENCE = 'One native binary. It upgrades itself from signed releases.'

const PLATFORMS: Record<Platform, { label: string, command: string, consequence: string }> = {
  unix: { label: 'macOS / Linux', command: cliNativeInstallCmd(), consequence: NATIVE_CONSEQUENCE },
  windows: { label: 'Windows', command: cliWindowsInstallCmd(), consequence: NATIVE_CONSEQUENCE },
  npm: { label: 'npm', command: cliGlobalInstallCmd(), consequence: 'Needs Node.js. npm handles upgrades.' },
}

const options = (Object.keys(PLATFORMS) as Platform[]).map(value => ({ value, label: PLATFORMS[value].label }))

const platform = ref<Platform>('unix')
const rootRef = ref<HTMLElement>()
const consequenceId = useId()

const command = computed(() => PLATFORMS[platform.value].command)
// The CLI is the `skilld-dev/skilld` Repository, not a Skill, so copies count as a repo target.
const target: InstallTarget = { kind: 'repo', owner: 'skilld-dev', repo: 'skilld' }

function choose(next: Platform) {
  if (next === platform.value)
    return
  platform.value = next
  // A fallback selection would now cover the other command, so drop it.
  const selection = window.getSelection()
  if (selection?.anchorNode && rootRef.value?.contains(selection.anchorNode))
    selection.removeAllRanges()
}
</script>

<template>
  <div ref="rootRef" class="cli-install-chip">
    <ChipSwitch :options="options" :selected="platform" label="Platform" @select="choose" />
    <CommandChip
      :command="command"
      mode="install"
      size="sm"
      :quiet="quiet"
      :surface="surface"
      :target="target"
      copy-label="Copy CLI install command"
      :described-by="consequenceId"
    />
    <p :id="consequenceId" class="cli-install-chip__consequence" aria-live="polite">
      {{ PLATFORMS[platform].consequence }}
    </p>
  </div>
</template>

<style scoped>
.cli-install-chip {
  display: grid;
  gap: 0.625rem;
  justify-items: start;
  min-width: 0;
}

.cli-install-chip > :deep(.command-chip) {
  justify-self: stretch;
}

.cli-install-chip__consequence {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--ui-text-muted);
}
</style>
