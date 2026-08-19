<script setup lang="ts">
import { tokenizeInstallCmd } from '~/utils/install-cmd'

const { command, wrap = false } = defineProps<{
  command: string
  /** Let a long command break across lines instead of scrolling sideways. */
  wrap?: boolean
}>()

// The trailing space rides inside the token so Vue cannot condense it away.
const parts = computed(() => {
  const tokens = tokenizeInstallCmd(command)
  return tokens.map((token, index) => ({
    role: token.role,
    text: index < tokens.length - 1 ? `${token.text} ` : token.text,
  }))
})
</script>

<template>
  <code class="install-command" :class="wrap && 'install-command--wrap'"><span
    v-for="(part, index) in parts"
    :key="index"
    :class="`install-command__${part.role}`"
  >{{ part.text }}</span></code>
</template>
