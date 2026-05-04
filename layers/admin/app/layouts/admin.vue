<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { user, isAuthenticated, isLoading } = useAuth()
const isAdmin = computed(() => user.value?.email?.toLowerCase() === 'harlan@harlanzw.com')

useRobotsRule(false)

const links: NavigationMenuItem[] = [
  {
    label: 'Integrity',
    icon: 'i-lucide-shield-check',
    to: '/admin',
    exact: true,
  },
  {
    label: 'Social queue',
    icon: 'i-lucide-message-square',
    to: '/admin/social-queue',
  },
]
</script>

<template>
  <div class="min-h-screen bg-default">
    <div
      v-if="isLoading"
      class="mx-auto max-w-5xl px-4 py-12 text-sm text-muted"
    >
      Loading...
    </div>

    <div
      v-else-if="!isAuthenticated || !isAdmin"
      class="mx-auto max-w-md px-4 py-12"
    >
      <div class="rounded-lg border border-default bg-elevated p-6 text-sm">
        <div class="mb-3 flex items-center gap-2 font-medium">
          <UIcon
            name="i-lucide-shield"
            class="size-4"
            aria-hidden="true"
          />
          Admin access required
        </div>
        <p class="text-muted">
          Sign in as <code class="font-mono">harlan@harlanzw.com</code> to access this page.
        </p>
      </div>
    </div>

    <div
      v-else
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
