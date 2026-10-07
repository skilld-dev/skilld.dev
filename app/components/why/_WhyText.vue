<script setup lang="ts">
/**
 * One line of Why copy. A span in backticks prints as code, so a command in
 * `why-skilld.ts` reads as a command on the page.
 */
const { text } = defineProps<{ text: string }>()

const parts = computed(() => text.split('`').map((value, index) => ({ value, code: index % 2 === 1 })))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <code v-if="part.code" class="why-text__code">{{ part.value }}</code>
    <template v-else>
      {{ part.value }}
    </template>
  </template>
</template>

<style scoped>
.why-text__code {
  padding: 0.0625rem 0.3125rem;
  border: 1px solid var(--ui-border);
  border-radius: calc(var(--ui-radius) * 0.5);
  background: var(--ui-bg-muted);
  font-family: var(--font-mono);
  font-size: 0.85em;
  white-space: nowrap;
}
</style>
