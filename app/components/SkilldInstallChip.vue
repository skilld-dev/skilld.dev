<script setup lang="ts">
import type { InstallTarget } from '~/composables/useInstallCopy'
import { skilldSelfInstallCmd } from '#shared/skill-commands'
import CommandChip from './_CommandChip.vue'

/**
 * The solid install chip for the "Teach your agent skilld" promotion. It
 * installs the skilld-maintained skilld Skill globally, so the Agent can
 * drive the CLI in every project.
 */
const { surface, quiet = false } = defineProps<{
  /** The analytics surface, such as `nav-promo`. */
  surface: string
  /** Ink the dot instead of rose, where a solid rose button shares the band. */
  quiet?: boolean
}>()

const command = skilldSelfInstallCmd()
// The skilld Skill lives in the CLI repository, so copies count against `skilld-dev/skilld`.
const target: InstallTarget = { kind: 'skill', owner: 'skilld-dev', name: 'skilld' }
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
      :described-by="consequenceId"
    />
    <span :id="consequenceId" class="sr-only">Adds the skilld Skill to your agent for every project.</span>
  </div>
</template>
