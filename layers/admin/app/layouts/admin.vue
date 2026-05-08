<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

useRobotsRule(false)

// Phase 1: admin UI is gated server-side via bearer token only. Session-based
// admin gating returns in Phase 2 with GitHub OAuth.
const links: NavigationMenuItem[] = [
  {
    label: 'Integrity',
    icon: 'i-lucide-shield-check',
    to: '/admin',
    exact: true,
  },
]
</script>

<template>
  <div class="min-h-screen bg-default">
    <div
      class="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-[240px_1fr]"
    >
      <aside class="border-b border-default px-4 py-4 lg:border-b-0 lg:border-r lg:py-6">
        <NuxtLink
          to="/admin"
          class="mb-5 flex items-center gap-2 text-sm font-semibold"
        >
          <span class="flex size-8 items-center justify-center rounded-md bg-primary/10">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4 text-primary"
              aria-hidden="true"
            />
          </span>
          skilld admin
        </NuxtLink>

        <UNavigationMenu
          :items="[links]"
          orientation="vertical"
          highlight
          :ui="{ link: 'w-full', linkLeadingIcon: 'mr-2' }"
        />

        <USeparator class="my-4" />

        <UButton
          to="/"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          label="Back to site"
          class="w-full justify-start"
        />
      </aside>

      <main class="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
