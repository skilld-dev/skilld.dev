<script setup lang="ts">
const { description } = useSiteConfig()
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
    <div class="flex w-full h-full items-center justify-center px-20">
      <div class="flex flex-col gap-8 items-center text-center">
        <OgBrand :size="64" />
        <div
          class="text-4xl leading-snug"
          :style="{ color: 'oklch(0.62 0.01 60)' }"
        >
          {{ description }}
        </div>
      </div>
    </div>
  </OgLayout>
</template>
