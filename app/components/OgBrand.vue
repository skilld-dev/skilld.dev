<script setup lang="ts">
const { size = 32 } = defineProps<{
  size?: number
}>()
</script>

<template>
  <div class="flex items-center" :style="{ gap: `${size * 0.12}px` }">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M80 34 L135 104 L121 104 L80 52 L39 104 L25 104 Z" fill="#fb7185" />
    </svg>
    <span
      class="font-mono font-semibold tracking-tight"
      :style="{ fontSize: `${size}px`, lineHeight: 1 }"
    >skilld</span>
  </div>
</template>
