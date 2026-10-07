<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const { state, logout, isLoading } = useAuth()
const navigationOpen = ref(false)
const navigationToggle = useTemplateRef<{ $el: HTMLButtonElement }>('navigationToggle')

function restoreNavigationFocus(event: Event) {
  event.preventDefault()
  navigationToggle.value?.$el.focus()
}

const navigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Your skills', icon: 'i-lucide-heart', to: '/me', active: route.path === '/me' && !['email', 'repositories', 'skillgen', 'account'].includes(String(route.query.view)) },
  { label: 'Repository coverage', icon: 'i-lucide-git-fork', to: '/me?view=repositories', active: route.path === '/me' && route.query.view === 'repositories' },
  { label: 'Email updates', icon: 'i-lucide-mail', to: '/me?view=email', active: route.path === '/me' && route.query.view === 'email' },
  { label: 'Set up your agent', icon: 'i-lucide-plug', to: '/developers', active: route.path === '/developers' || route.path.startsWith('/developers/') },
  { label: 'Skillgen', icon: 'i-lucide-git-pull-request-draft', to: '/me?view=skillgen', active: route.path === '/me' && route.query.view === 'skillgen' },
  { label: 'Devices and tokens', icon: 'i-lucide-terminal', to: '/me/devices', active: route.path.startsWith('/me/devices') || route.path.startsWith('/me/cli-tokens') },
  { label: 'Account', icon: 'i-lucide-settings', to: '/me?view=account', active: route.path === '/me' && route.query.view === 'account' },
])

const collectionNavigation = computed<NavigationMenuItem[]>(() => [
  { label: 'Publish a collection', icon: 'i-lucide-folder-plus', to: '/collections/new', active: route.path === '/collections/new' },
  ...(state.value._tag === 'signed-in'
    ? [{ label: 'View profile', icon: 'i-lucide-user-round', to: `/@${state.value.user.login}` }]
    : []),
])
</script>

<template>
  <UDashboardGroup unit="rem" :persistent="false" storage-key="skilld-account">
    <UDashboardSidebar
      v-model:open="navigationOpen"
      :default-size="16"
      :min-size="16"
      :max-size="16"
      :toggle="false"
      class="bg-muted/40"
      :menu="{
        title: 'Account',
        description: 'Your skills and account tools',
        content: { onCloseAutoFocus: restoreNavigationFocus },
      }"
      :ui="{ header: 'px-4', body: 'gap-6 px-3 py-5', footer: 'border-t border-default p-3', content: 'w-80 max-w-[calc(100vw-3rem)] border-r border-default shadow-none' }"
    >
      <template #header>
        <NuxtLink to="/" aria-label="skilld, home" class="flex min-h-11 items-center rounded-lg">
          <AppLogo />
        </NuxtLink>
        <UButton v-if="navigationOpen" icon="i-lucide-x" aria-label="Close menu" color="neutral" variant="ghost" class="ml-auto min-h-11 min-w-11 lg:hidden" @click="navigationOpen = false" />
      </template>

      <div class="space-y-6">
        <UNavigationMenu
          aria-label="Account"
          :items="navigation"
          orientation="vertical"
          :ui="{ link: 'min-h-11 font-mono text-sm', linkLabel: 'whitespace-normal' }"
        />
        <USeparator />
        <UNavigationMenu
          aria-label="Collections"
          :items="collectionNavigation"
          orientation="vertical"
          :ui="{ link: 'min-h-11 font-mono text-sm', linkLabel: 'whitespace-normal' }"
        />
      </div>

      <UButton to="/skills" label="Find skills" icon="i-lucide-arrow-up-right" color="neutral" variant="ghost" class="mt-auto min-h-11 justify-start" />

      <template #footer>
        <div :aria-busy="state._tag === 'pending'">
          <USkeleton v-if="state._tag === 'pending'" class="h-11 w-full" />
          <template v-else-if="state._tag === 'signed-in'">
            <NuxtLink :to="`/@${state.user.login}`" class="flex min-h-11 items-center gap-2 rounded-lg px-2 font-mono text-sm hover:bg-elevated">
              <UIcon name="i-lucide-user-round" class="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span class="truncate">@{{ state.user.login }}</span>
            </NuxtLink>
            <UButton label="Sign out" icon="i-lucide-log-out" color="neutral" variant="ghost" class="min-h-11 w-full justify-start" :loading="isLoading" @click="logout()" />
          </template>
          <UButton v-else :to="{ path: '/login', query: { return_to: route.fullPath } }" label="Sign in" icon="i-lucide-github" color="neutral" variant="outline" class="min-h-11 w-full justify-center" />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel :ui="{ body: 'p-0' }">
      <template #header>
        <UDashboardNavbar :toggle="false">
          <template #left>
            <UButton ref="navigationToggle" icon="i-lucide-menu" aria-label="Open menu" aria-haspopup="dialog" color="neutral" variant="ghost" class="min-h-11 min-w-11 lg:hidden" :aria-expanded="navigationOpen" @click="navigationOpen = true" />
            <NuxtLink to="/me" class="flex min-h-11 items-center font-mono text-sm text-muted hover:text-default">
              skilld
            </NuxtLink>
          </template>
          <template #right>
            <SkillSearchTrigger />
            <UColorModeButton color="neutral" variant="ghost" class="min-h-11 min-w-11" />
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <main id="main-content" tabindex="-1" class="min-w-0 px-4 pb-12 sm:px-6 lg:px-8">
          <slot />
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
