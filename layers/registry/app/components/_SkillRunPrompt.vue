<script setup lang="ts">
import { SKILL_RUN_PROMPT_LEAD } from '#shared/skill-commands'

const { url } = defineProps<{
  /** The Skill page. The Agent fetches it and receives the SKILL.md as markdown. */
  url: string
}>()

// A wrapped URL breaks after a path slash, never inside a name or the origin.
const parts = computed(() => url.match(/^[a-z]+:\/\/[^/]+\/?|[^/]+\/|[^/]+$/gi) ?? [url])
</script>

<template>
  <code class="install-command install-command--wrap"><span class="install-command__runner">{{ `${SKILL_RUN_PROMPT_LEAD} ` }}</span><span class="install-command__target"><template
    v-for="(part, index) in parts"
    :key="index"
  >{{ part }}<wbr v-if="index < parts.length - 1"></template></span></code>
</template>
