<script setup lang="ts">
const { step } = defineProps<{ step: 1 | 2 }>()

const steps = [
  { n: 1, label: 'Discover' },
  { n: 2, label: 'Email' },
] as const
</script>

<template>
  <ol class="flex items-center gap-2 text-xs font-mono text-muted list-none p-0">
    <li
      v-for="(s, i) in steps"
      :key="s.n"
      class="flex items-center gap-2"
    >
      <span
        class="flex h-5 w-5 items-center justify-center rounded-full border"
        :class="s.n === step
          ? 'border-primary bg-primary text-inverted'
          : s.n < step
            ? 'border-default bg-elevated text-default'
            : 'border-default text-muted'"
      >
        {{ s.n }}
      </span>
      <span :class="s.n === step ? 'text-default' : ''">{{ s.label }}</span>
      <span v-if="i < steps.length - 1" class="text-muted">·</span>
    </li>
  </ol>
</template>
