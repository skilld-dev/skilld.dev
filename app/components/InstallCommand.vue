<script setup lang="ts">
import { tokenizeInstallCmd } from '~/utils/install-cmd'

const { command, wrap = false, splitName = false } = defineProps<{
  command: string
  /** Let a long command break across lines instead of scrolling sideways. */
  wrap?: boolean
  /**
   * Give the last segment of an `owner/repo/skill` target the name role, and
   * allow a line break after each slash. The run chip uses it, so a wrapped
   * command breaks between segments and the Skill name reads first.
   */
  splitName?: boolean
}>()

interface Part {
  role: string
  text: string
  /** Allow a line break after this part. */
  breakAfter?: boolean
}

function splitTarget(text: string): Part[] {
  const segments = text.split('/')
  if (segments.length < 2)
    return [{ role: 'target', text }]
  const name = segments.pop()!
  return [
    ...segments.map(segment => ({ role: 'target', text: `${segment}/`, breakAfter: true })),
    { role: 'name', text: name },
  ]
}

// The trailing space rides inside the token so Vue cannot condense it away.
const parts = computed<Part[]>(() => {
  const tokens = tokenizeInstallCmd(command)
  return tokens.flatMap((token, index) => {
    const space = index < tokens.length - 1 ? ' ' : ''
    if (!splitName || token.role !== 'target')
      return [{ role: token.role, text: `${token.text}${space}` }]
    const split = splitTarget(token.text)
    split[split.length - 1]!.text += space
    return split
  })
})
</script>

<template>
  <code class="install-command" :class="wrap && 'install-command--wrap'"><template
    v-for="(part, index) in parts"
    :key="index"
  ><span :class="`install-command__${part.role}`">{{ part.text }}</span><wbr v-if="part.breakAfter"></template></code>
</template>
