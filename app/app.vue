<script setup lang="ts">
import { onKeyDown } from '@vueuse/core'
import { isEditableElement } from '~/utils/input'

const title = 'skilld'
const description = 'Curated agent skills from trusted open-source developers'

const { user, isAuthenticated, isLoading } = useAuth()
const authModalOpen = ref(false)
const shortcutsModalOpen = ref(false)

const { enabled: kbdEnabled } = useKeyboardShortcuts()
const { justSignedIn } = useOnboarding()

// Detect auth transition to trigger welcome banner
if (import.meta.client) {
  let wasAuthenticated = false
  watch(isAuthenticated, (val) => {
    if (val && !wasAuthenticated)
      justSignedIn.value = true
    wasAuthenticated = val
  })
}

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

provide('authModalOpen', authModalOpen)

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
        <UButton
          to="/people"
          label="People"
          color="neutral"
          variant="ghost"
          size="sm"
          class="hidden lg:inline-flex"
        />
        <UColorModeButton />
        <UButton
          to="https://github.com/harlan-zw/skilld"
          target="_blank"
          icon="i-lucide-github"
          aria-label="GitHub repository (opens in new tab)"
          color="neutral"
          variant="ghost"
        />

        <!-- Auth: avatar or sign in -->
        <ClientOnly>
          <template v-if="!isLoading">
            <button
              v-if="isAuthenticated && user"
              class="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
              aria-label="Account settings"
              @click="authModalOpen = true"
            >
              <img
                v-if="user.avatar"
                :src="user.avatar"
                :alt="`Avatar for ${user.handle}`"
                width="24"
                height="24"
                class="size-6 rounded-full"
              >
              <span class="hidden font-mono text-xs sm:inline">@{{ user.handle }}</span>
            </button>
            <UButton
              v-else
              label="Sign in"
              icon="i-lucide-log-in"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="authModalOpen = true"
            />
          </template>
        </ClientOnly>
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
          <UButton
            to="/people"
            label="People"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
          />
        </nav>
      </template>
    </UHeader>

    <ClientOnly>
      <WelcomeBanner />
    </ClientOnly>

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
      <AuthModal v-model:open="authModalOpen" />
      <KeyboardShortcutsModal v-model:open="shortcutsModalOpen" />
    </ClientOnly>
  </UApp>
</template>
