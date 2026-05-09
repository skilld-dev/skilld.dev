<script setup lang="ts">
import { onKeyDown } from '@vueuse/core'
import { isEditableElement } from '~/utils/input'

const title = 'skilld'
const description = 'Curated agent skills from trusted open-source developers'

const shortcutsModalOpen = ref(false)
const { isAuthenticated, user, logout } = useAuth()

const { enabled: kbdEnabled } = useKeyboardShortcuts()

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  htmlAttrs: { lang: 'en' },
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image',
})

defineOgImage('Page.takumi', {}, { alt: 'skilld — curated agent skills from trusted open-source developers' })

// Global keyboard shortcuts
onKeyDown('/', async (e) => {
  if (!kbdEnabled.value || isEditableElement(e.target))
    return
  e.preventDefault()
  const searchInput = document.getElementById('skill-search') as HTMLInputElement | null
  if (searchInput) {
    searchInput.focus()
  }
  else {
    return navigateTo('/skills')
  }
}, { dedupe: true })

onKeyDown('?', (e) => {
  if (!kbdEnabled.value || isEditableElement(e.target))
    return
  e.preventDefault()
  shortcutsModalOpen.value = true
}, { dedupe: true })
</script>

<template>
  <UApp>
    <!-- Skip link for keyboard users -->
    <NuxtLink
      to="#main-content"
      external
      class="skip-link"
    >
      Skip to main content
    </NuxtLink>

    <!-- Route change announcements for screen readers -->
    <NuxtRouteAnnouncer />

    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="flex items-center gap-2"
          aria-label="skilld, home"
        >
          <AppLogo />
        </NuxtLink>
      </template>

      <template #right>
        <UButton
          to="/skills"
          label="Skills"
          color="neutral"
          variant="ghost"
          size="sm"
          class="hidden lg:inline-flex"
        />
        <UButton
          to="/collections"
          label="Collections"
          color="neutral"
          variant="ghost"
          size="sm"
          class="hidden lg:inline-flex"
        />
        <UColorModeButton />

        <template v-if="isAuthenticated && user">
          <UButton
            to="/me"
            :label="`@${user.login}`"
            icon="i-lucide-user"
            color="neutral"
            variant="ghost"
            size="sm"
          />
          <UButton
            label="Sign out"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="logout"
          />
        </template>
        <UButton
          v-else
          to="/login"
          label="Sign in"
          icon="i-lucide-github"
          color="neutral"
          variant="ghost"
          size="sm"
        />
      </template>

      <template #body>
        <nav
          class="flex flex-col gap-1 p-4"
          aria-label="Mobile navigation"
        >
          <UButton
            to="/skills"
            label="Skills"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
          />
          <UButton
            to="/collections"
            label="Collections"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
          />
        </nav>
      </template>
    </UHeader>

    <UMain
      id="main-content"
      tabindex="-1"
    >
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="font-mono text-xs text-muted">
          Built by <a
            href="https://harlanzw.com"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2 hover:text-default"
          >Harlan Wilton</a>
        </p>
      </template>

      <template #right>
        <NuxtLink
          to="/skills/stats"
          class="font-mono text-xs text-muted underline-offset-2 hover:underline hover:text-default"
        >
          Stats
        </NuxtLink>
        <NuxtLink
          to="/accessibility"
          class="font-mono text-xs text-muted underline-offset-2 hover:underline hover:text-default"
        >
          Accessibility
        </NuxtLink>
        <UButton
          icon="i-lucide-keyboard"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Keyboard shortcuts"
          aria-haspopup="dialog"
          @click="shortcutsModalOpen = true"
        />
        <UButton
          to="https://github.com/harlan-zw/skilld"
          target="_blank"
          icon="i-lucide-github"
          aria-label="GitHub repository (opens in new tab)"
          color="neutral"
          variant="ghost"
          size="xs"
        />
      </template>
    </UFooter>

    <ClientOnly>
      <KeyboardShortcutsModal v-model:open="shortcutsModalOpen" />
    </ClientOnly>
  </UApp>
</template>
