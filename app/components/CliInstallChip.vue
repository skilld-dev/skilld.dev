<script setup lang="ts">
import type { InstallTarget } from '~/composables/useInstallCopy'
import { cliGlobalInstallCmd } from '#shared/skill-commands'
import CommandChip from './_CommandChip.vue'

/**
 * The solid install chip for the CLI itself: one global npm install. It sits
 * beside `SkilldInstallChip` on the `/cli` page, which teaches the Agent to
 * drive what this one installs.
 */
const { surface, quiet = false } = defineProps<{
  /** The analytics surface, such as `cli-hero`. */
  surface: string
  /** Ink the dot instead of rose, where another element already spends the band's rose. */
  quiet?: boolean
}>()

const command = cliGlobalInstallCmd()
// The CLI is the `skilld-dev/skilld` Repository, not a Skill, so copies count as a repo target.
const target: InstallTarget = { kind: 'repo', owner: 'skilld-dev', repo: 'skilld' }
const consequenceId = useId()
</script>

<template>
  <div class="min-w-0">
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
    <span :id="consequenceId" class="sr-only">Installs the skilld CLI for your user account.</span>
  </div>
</template>
