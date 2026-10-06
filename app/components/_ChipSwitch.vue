<script setup lang="ts" generic="T extends string">
/**
 * The switch above a command chip. Each option is a toggle button, so a screen
 * reader hears which command the chip holds. The `lead` slot draws a mark
 * before each label, such as the run chip's legend dots.
 */
const { options, selected, label } = defineProps<{
  options: readonly { value: T, label: string }[]
  selected: T
  /** Names the group, such as `Command`. */
  label: string
}>()

const emit = defineEmits<{ select: [value: T] }>()
</script>

<template>
  <div class="chip-switch" role="group" :aria-label="label">
    <button
      v-for="item in options"
      :key="item.value"
      type="button"
      class="chip-switch__option"
      :aria-pressed="selected === item.value"
      @click="emit('select', item.value)"
    >
      <slot name="lead" :value="item.value" />
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.chip-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ui-border-accented);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.chip-switch__option {
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
  .chip-switch__option:hover {
    color: var(--ui-text);
  }
}

.chip-switch__option[aria-pressed='true'] {
  background: var(--ui-bg-muted);
  color: var(--ui-text);
  font-weight: 500;
}

@media (pointer: coarse) {
  .chip-switch__option {
    min-height: 2.75rem;
  }
}
</style>
