<template>
  <div
    data-theme="dark"
    class="flex w-full h-full relative overflow-hidden font-sans"
    :style="{
      background: 'oklch(0.14 0.008 60)',
      color: 'oklch(0.93 0.008 60)',
    }"
  >
    <slot />
  </div>
</template>
