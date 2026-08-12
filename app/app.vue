<script setup lang="ts">
import { onClickOutside, onKeyDown } from '@vueuse/core'
import { isEditableElement } from '~/utils/input'

const title = 'skilld'
const description = 'Agent skills written by real maintainers in their own GitHub repos, with links to source'

const shortcutsModalOpen = ref(false)
const mobileNavigationOpen = ref(false)
const mobileNavigation = useTemplateRef('mobileNavigation')
const mobileNavigationToggle = useTemplateRef('mobileNavigationToggle')
const route = useRoute()
const isAdminLayout = computed(() => route.meta.layout === 'admin')
const { isAuthenticated, user, logout } = useAuth()

const { enabled: kbdEnabled } = useKeyboardShortcuts()
const skillSearch = useSkillSearch()

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

defineOgImage('Page.takumi', {}, { alt: 'skilld, agent skills written by real maintainers' })

// Global keyboard shortcuts.
// `/` prefers the page's own search field when there is one (the /skills
// registry view), and otherwise opens the header search panel. Cmd/Ctrl+K
// always opens the panel, since that is the shortcut users arrive expecting.
function focusGlobalSearch(): void {
  skillSearch.open.value = true
  void skillSearch.loadTypeaheadIndex()
  void nextTick(() => {
    document.getElementById('global-skill-search')?.focus()
  })
}

onKeyDown('/', (e) => {
  if (!kbdEnabled.value || isEditableElement(e.target))
    return
  e.preventDefault()
  const pageSearchInput = document.getElementById('skill-search') as HTMLInputElement | null
  if (pageSearchInput)
    pageSearchInput.focus()
  else
    focusGlobalSearch()
}, { dedupe: true })

onKeyDown('k', (e) => {
  if (!e.metaKey && !e.ctrlKey)
    return
  e.preventDefault()
  focusGlobalSearch()
}, { dedupe: true })

onKeyDown('?', (e) => {
  if (!kbdEnabled.value || isEditableElement(e.target))
    return
  e.preventDefault()
  shortcutsModalOpen.value = true
}, { dedupe: true })

onKeyDown('Escape', () => {
  mobileNavigationOpen.value = false
}, { dedupe: true })

onClickOutside(mobileNavigation, () => {
  mobileNavigationOpen.value = false
}, { ignore: [mobileNavigationToggle] })

watch(() => route.fullPath, () => {
  mobileNavigationOpen.value = false
})
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

    <NuxtLayout v-if="isAdminLayout">
      <NuxtPage />
    </NuxtLayout>

    <template v-else>
      <UHeader :toggle="false">
        <template #left>
          <NuxtLink
            to="/"
            class="flex min-h-11 items-center gap-2"
            aria-label="skilld, home"
          >
            <AppLogo />
          </NuxtLink>
        </template>

        <template #right>
          <SkillSearchTrigger />
          <UButton
            to="/skills"
            label="Skills"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden lg:inline-flex"
          />
          <UButton
            to="/skills/leaderboard"
            label="Leaderboard"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden lg:inline-flex"
          />
          <UButton
            to="/community"
            label="Community"
            color="neutral"
            variant="ghost"
            size="sm"
            class="hidden lg:inline-flex"
          />
          <UColorModeButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="min-h-11 min-w-11"
          />

          <ClientOnly>
            <template v-if="isAuthenticated && user">
              <UButton
                to="/me"
                :label="`@${user.login}`"
                icon="i-lucide-user"
                color="neutral"
                variant="ghost"
                size="sm"
                class="hidden lg:inline-flex"
              />
              <UButton
                label="Sign out"
                color="neutral"
                variant="ghost"
                size="sm"
                class="hidden lg:inline-flex"
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
              class="hidden lg:inline-flex"
            />
            <template #fallback>
              <UButton
                to="/login"
                label="Sign in"
                icon="i-lucide-github"
                color="neutral"
                variant="ghost"
                size="sm"
                class="hidden lg:inline-flex"
              />
            </template>
          </ClientOnly>

          <UButton
            id="mobile-navigation-toggle"
            ref="mobileNavigationToggle"
            :icon="mobileNavigationOpen ? 'i-lucide-x' : 'i-lucide-menu'"
            color="neutral"
            variant="ghost"
            class="-me-1.5 min-h-11 min-w-11 lg:hidden"
            :aria-label="mobileNavigationOpen ? 'Close menu' : 'Open menu'"
            aria-controls="mobile-navigation"
            :aria-expanded="mobileNavigationOpen"
            @click="mobileNavigationOpen = !mobileNavigationOpen"
          />
        </template>

        <template #bottom>
          <div
            v-show="mobileNavigationOpen"
            id="mobile-navigation"
            ref="mobileNavigation"
            class="absolute inset-x-0 top-full border-b border-default bg-default shadow-lg lg:hidden"
          >
            <nav
              class="flex flex-col gap-1 p-4 sm:px-6"
              aria-label="Mobile navigation"
            >
              <UButton
                to="/skills"
                label="Skills"
                color="neutral"
                variant="ghost"
                block
                class="min-h-11 justify-start"
              />
              <UButton
                to="/skills/leaderboard"
                label="Leaderboard"
                color="neutral"
                variant="ghost"
                block
                class="min-h-11 justify-start"
              />
              <UButton
                to="/community"
                label="Community"
                color="neutral"
                variant="ghost"
                block
                class="min-h-11 justify-start"
              />
              <USeparator class="my-1" />
              <ClientOnly>
                <template v-if="isAuthenticated && user">
                  <UButton
                    to="/me"
                    :label="`@${user.login}`"
                    icon="i-lucide-user"
                    color="neutral"
                    variant="ghost"
                    block
                    class="min-h-11 justify-start"
                  />
                  <UButton
                    label="Sign out"
                    icon="i-lucide-log-out"
                    color="neutral"
                    variant="ghost"
                    block
                    class="min-h-11 justify-start"
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
                  block
                  class="min-h-11 justify-start"
                />
              </ClientOnly>
            </nav>
          </div>
        </template>
      </UHeader>

      <UMain
        id="main-content"
        tabindex="-1"
        class="[contain:style]"
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
            @click="() => { shortcutsModalOpen = true }"
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
    </template>
  </UApp>
</template>
