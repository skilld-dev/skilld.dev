<script setup lang="ts">
const { title, description } = defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <OgLayout>
    <!-- Subtle rose accent bar at top -->
    <div
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'oklch(0.555 0.225 17.32)',
      }"
    />
    <div class="px-15 py-14 flex flex-col justify-center gap-10 h-full">
      <OgBrand :size="36" />

      <div class="flex flex-col max-w-full gap-3">
        <div
          class="text-6xl tracking-tighter font-mono leading-none"
          :style="{ lineClamp: 2, textOverflow: 'ellipsis' }"
        >
          {{ title }}
        </div>
      </div>

      <div
        v-if="description"
        class="text-3xl"
        :style="{ color: 'oklch(0.62 0.01 60)', lineClamp: 2, textOverflow: 'ellipsis' }"
      >
        {{ description }}
      </div>
    </div>
  </OgLayout>
</template>
