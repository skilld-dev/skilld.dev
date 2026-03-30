<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
  }>(),
  {
    size: 32,
  },
)
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      :style="{
        width: '4px',
        height: `${size}px`,
        borderRadius: '2px',
        background: 'oklch(0.555 0.225 17.32)',
      }"
    />
    <span
      class="font-mono font-semibold tracking-tight"
      :style="{ fontSize: `${size}px`, lineHeight: 1 }"
    >skilld</span>
  </div>
</template>
