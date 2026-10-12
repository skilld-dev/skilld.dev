<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-muted/40">
    <header class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <NuxtLink to="/" class="flex min-h-11 items-center gap-2 rounded-lg font-mono text-sm text-muted hover:text-default">
        <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
        skilld.dev
      </NuxtLink>
      <UColorModeButton color="neutral" variant="ghost" class="min-h-11 min-w-11" />
    </header>
    <main id="main-content" tabindex="-1" class="editorial-band flex flex-1 flex-col items-center justify-center px-4 pt-6 pb-16 sm:px-6">
      <div v-if="route.meta.authWide" class="editorial-atmosphere" data-palette="rose" data-geometry="bloom" data-intensity="ambient" aria-hidden="true" />
      <NuxtLink to="/" aria-label="skilld, home" class="editorial-band__content mb-8 flex min-h-11 items-center rounded-lg">
        <AppLogo />
      </NuxtLink>
      <div class="editorial-band__content w-full" :class="route.meta.authWide ? 'max-w-[51rem]' : 'max-w-2xl'">
        <slot />
      </div>
    </main>
  </div>
</template>
